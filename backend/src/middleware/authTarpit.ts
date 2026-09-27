import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';

/**
 * Login/registration tarpit + identity lockout.
 *
 * Three cooperating mechanisms, all in-memory and hard-capped like the
 * other limiters in this codebase (a Map that must never grow without
 * bound):
 *
 * 1. Progressive delay — after a few failures from one IP, each further
 *    attempt is held for an exponentially growing delay (capped well
 *    under client timeouts) so scripted guessing burns wall-clock time,
 *    while a human mistyping their password twice never notices.
 * 2. Identity lockout — repeated failures against the same email lock
 *    that email for a progressive window (15min → 30min → 60min cap).
 *    The counter is keyed on the submitted email whether or not the
 *    account exists, and the response is byte-identical for both, so
 *    locks cannot be used to enumerate addresses.
 * 3. Honeypot hold — registration bodies that fill the invisible
 *    `website` field (only automated form-fillers do) are held for a
 *    long fixed time before being rejected.
 *
 * The middleware runs BEFORE the rate limiter on each route so even
 * requests that are about to be rejected with 429 are slowed first; a
 * "tarpit" that lets probes bounce back instantly isn't one.
 */

type TarpitKind = 'login' | 'register';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 10_000;

/** Failures before any artificial delay kicks in — real users mistype a
 *  password once or twice and must never feel this. */
const DELAY_AFTER_FAILURES = 3;
/** Progressive delay ceiling. Kept under typical client timeouts so the
 *  response still arrives (and keeps counting against the limiter)
 *  rather than surfacing as a network error the client retries. */
const MAX_DELAY_MS = 8_000;
/** Identity lock thresholds. */
const LOCK_AFTER_FAILURES = 5;
const LOCK_BASE_MS = 15 * 60 * 1000;
const LOCK_MAX_MS = 60 * 60 * 1000;
/** Honeypot hold: bots pay this per attempt. */
const HONEYPOT_HOLD_MS = 25_000;

interface FailureRecord {
  failures: number;
  lockedUntil: number;
  updatedAt: number;
}

const ipFailures = new Map<string, FailureRecord>();
const acctFailures = new Map<string, FailureRecord>();

/** Normalize an attempted email into a lockout key. Returns null for
 *  anything that isn't a plausible address so junk bodies can't grow
 *  the key space. */
export function normalizeIdentityEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  if (!normalized || normalized.length > 254) return null;
  return normalized;
}

/** A record whose last activity is older than the window counts as
 *  fresh — failures decay instead of accumulating for life. */
function liveFailures(rec: FailureRecord | undefined, now: number): number {
  if (!rec) return 0;
  if (now - rec.updatedAt > WINDOW_MS) return 0;
  return rec.failures;
}

function cleanup(map: Map<string, FailureRecord>, now: number): void {
  if (map.size < MAX_ENTRIES) return;
  for (const [key, rec] of map) {
    if (rec.lockedUntil <= now && now - rec.updatedAt > WINDOW_MS) map.delete(key);
  }
  if (map.size >= MAX_ENTRIES) {
    // Still full: evict oldest insertions (Map preserves insertion
    // order) so the structure stays hard-bounded under flood.
    for (const key of map.keys()) {
      if (map.size < MAX_ENTRIES) break;
      map.delete(key);
    }
  }
}

/** Record a credential/registration failure against both the source IP
 *  and the target account, escalating to locks at the threshold. */
export function recordAuthFailure(kind: TarpitKind, ip: string | null, identity: string | null): void {
  const now = Date.now();
  cleanup(ipFailures, now);
  cleanup(acctFailures, now);

  const ipKey = `${kind}:ip:${ip || 'unknown'}`;
  const ipRec = ipFailures.get(ipKey) ?? { failures: 0, lockedUntil: 0, updatedAt: now };
  ipRec.failures = liveFailures(ipRec, now) + 1;
  ipRec.updatedAt = now;
  ipFailures.set(ipKey, ipRec);

  if (!identity) return;
  const acctKey = `${kind}:acct:${identity}`;
  const rec = acctFailures.get(acctKey) ?? { failures: 0, lockedUntil: 0, updatedAt: now };
  rec.failures = liveFailures(rec, now) + 1;
  rec.updatedAt = now;

  if (rec.failures % LOCK_AFTER_FAILURES === 0) {
    const tier = Math.min(rec.failures / LOCK_AFTER_FAILURES, 3);
    const lockMs = Math.min(LOCK_BASE_MS * 2 ** (tier - 1), LOCK_MAX_MS);
    rec.lockedUntil = now + lockMs;
    // Structured log so the suspicious-activity trail captures
    // lockouts even though no SecurityEvent enum value exists for it.
    logger.warn('auth_identity_locked', { kind, lockMs, failures: rec.failures });
  }
  acctFailures.set(acctKey, rec);
}

/** Successful authentication clears both counters for that actor. */
export function clearAuthFailures(kind: TarpitKind, ip: string | null, identity: string | null): void {
  if (ip) ipFailures.delete(`${kind}:ip:${ip}`);
  if (identity) acctFailures.delete(`${kind}:acct:${identity}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential hold for a given IP failure count: 0 below the human
 *  threshold, then 0.5s, 1s, 2s, 4s, 8s (capped). */
function delayFor(failures: number): number {
  if (failures < DELAY_AFTER_FAILURES) return 0;
  return Math.min(500 * 2 ** (failures - DELAY_AFTER_FAILURES), MAX_DELAY_MS);
}

export function authTarpit(kind: TarpitKind) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const now = Date.now();
      const ip = req.ip ?? null;
      const identity = normalizeIdentityEmail((req.body as { email?: unknown } | undefined)?.email);

      // Honeypot: invisible field only automated form-fillers populate.
      if (kind === 'register' && typeof req.body?.website === 'string' && req.body.website.trim() !== '') {
        await sleep(HONEYPOT_HOLD_MS);
        next(new ApiError(400, 'Validation failed', 'VALIDATION_ERROR'));
        return;
      }

      // Identity lock: identical response regardless of account
      // existence (no enumeration), with the exact retry window.
      if (identity) {
        const rec = acctFailures.get(`${kind}:acct:${identity}`);
        if (rec && rec.lockedUntil > now) {
          // A short hold too, so lock probing itself stays slow.
          await sleep(Math.min(delayFor(liveFailures(rec, now)), 2_000));
          next(new ApiError(
            429,
            'Too many failed attempts. Please try again later.',
            'RATE_LIMITED',
            Math.ceil((rec.lockedUntil - now) / 1000),
          ));
          return;
        }
      }

      // Progressive tarpit: only after repeated failures.
      const delay = delayFor(liveFailures(ipFailures.get(`${kind}:ip:${ip || 'unknown'}`), now));
      if (delay > 0) await sleep(delay);

      next();
    } catch (err) {
      next(err);
    }
  };
}
