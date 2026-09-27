import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';

type AuthAction = 'login' | 'register' | 'logout';

/**
 * Authentication attempt throttling, keyed on BOTH the source IP and
 * (for login/registration) the target account's email.
 *
 * Why two keys: IP-only limits are sidestepped by botnet spraying, and
 * conversely anyone sharing an attacker's NAT/egress could have their
 * own login bucket burned to lock them out. A generous per-IP bucket
 * plus a tight per-account bucket closes both directions: distributed
 * guessing still trips the account bucket, while one noisy client can't
 * starve everyone behind a shared address.
 *
 * Logout stays IP-keyed only — it's session-bound with no account
 * target in the body.
 */
const WINDOW_MS = 15 * 60 * 1000;
const IP_LIMITS: Record<AuthAction, number> = { login: 10, register: 5, logout: 30 };
const ACCOUNT_LIMITS: Record<AuthAction, number> = { login: 5, register: 3, logout: 30 };
const buckets = new Map<string, number[]>();
const MAX_BUCKETS = 10_000;

function cleanup(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, timestamps] of buckets) {
    const recent = timestamps.filter((time) => now - time < WINDOW_MS);
    if (recent.length === 0) buckets.delete(key);
    else buckets.set(key, recent);
    if (buckets.size < MAX_BUCKETS) break;
  }
}

function accountKeyPart(req: Request, action: AuthAction): string | null {
  if (action === 'logout') return null;
  const email = (req.body as { email?: unknown } | undefined)?.email;
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  // Cap the key so junk bodies can't grow the map's key space.
  if (!normalized || normalized.length > 254) return null;
  return normalized;
}

function allow(key: string, now: number, limit: number): boolean {
  const existing = buckets.get(key);
  let recent: number[];
  if (existing) {
    recent = existing.filter((time) => now - time < WINDOW_MS);
  } else if (buckets.size < MAX_BUCKETS) {
    recent = [];
  } else {
    // Hard cap: cleanup could not free a slot, so refuse to create
    // another bucket — the map must never grow without bound.
    return false;
  }
  if (recent.length >= limit) {
    buckets.set(key, recent); // persist the stale-timestamp reaping
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
}

/** Remaining window for a bucket, derived from its oldest attempt, so
 *  429 responses advertise an honest Retry-After. */
function retryAfterFor(key: string, now: number): number {
  const recent = buckets.get(key);
  if (!recent || recent.length === 0) return 60;
  const oldest = Math.min(...recent);
  return Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
}

function rejected(key: string, now: number): ApiError {
  return new ApiError(
    429,
    'Too many authentication attempts. Please try again later.',
    'RATE_LIMITED',
    retryAfterFor(key, now),
  );
}

export function authRateLimit(action: AuthAction) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const now = Date.now();
    cleanup(now);

    const ipKey = `${action}:ip:${req.ip || 'unknown'}`;
    if (!allow(ipKey, now, IP_LIMITS[action])) {
      next(rejected(ipKey, now));
      return;
    }

    const accountPart = accountKeyPart(req, action);
    if (accountPart !== null) {
      const acctKey = `${action}:acct:${accountPart}`;
      if (!allow(acctKey, now, ACCOUNT_LIMITS[action])) {
        next(rejected(acctKey, now));
        return;
      }
    }

    next();
  };
}
