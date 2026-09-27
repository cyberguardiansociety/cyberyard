import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Heuristic suspicious-request detection: scans URL + query + JSON body for
 * a small set of high-signal attack patterns (SQLi / XSS / traversal /
 * command injection), logs every hit, and blocks repeat offenders.
 *
 * Deliberately does NOT match a bare apostrophe or the literal `flag{` —
 * legit search input, flag submissions, and challenge writeups must never
 * trip this. Patterns are case-insensitive and URL/query values are checked
 * in their decoded form (express decodes req.query/req.body for us; raw
 * originalUrl is scanned too so encoded traversal like %2e%2e is caught).
 *
 * Thresholds (per IP, decay-style timestamp lists like middleware/rateLimit.ts):
 *   - every hit  -> logger.warn('suspicious_request', {ip, path, category})
 *                   (rotating file log — the durable audit trail, see below)
 *   - >= 3 hits in 10 min  -> escalation (SecurityEvent if a fitting action
 *                   existed; see note below — it does not, file log only)
 *   - >= 10 hits in 15 min -> blocked for 15 min with 403
 *                   SUSPICIOUS_REQUEST_BLOCKED (+ Retry-After header)
 *
 * SecurityEvent note (honest fallback): SecurityEventType in prisma/schema
 * is auth/admin-scoped (LOGIN_*, PASSWORD_*, ADMIN_*, …) with no value
 * fitting "suspicious request", and schema changes are owned elsewhere —
 * so escalation stays in the structured file/console log instead of being
 * forced into a misleading enum value.
 *
 * Tradeoffs, deliberately simple: the block applies to everyone including
 * admins (an admin pasting attack payloads 10+ times in 15 min is itself
 * worth a nudge; exempting by role would add a DB/role check to every
 * request). Exempt paths are only /api/health (liveness probes carry no
 * user content) and /api/realtime/stream (SSE connect has no body worth
 * scanning and a false block would silently kill live updates). Static
 * asset GETs still get scanned — it's a cheap regex over a short URL, and
 * a prefix allowlist would be more code than the cost it avoids.
 */

const SCAN_CAP = 8 * 1024; // never stringify/scan more than 8 KB per request
const HIT_WINDOW_MS = 10 * 60_000;
const BLOCK_WINDOW_MS = 15 * 60_000;
const ESCALATE_HITS = 3; // in HIT_WINDOW_MS
const BLOCK_HITS = 10; // in BLOCK_WINDOW_MS
const BLOCK_MS = 15 * 60_000;
const MAX_BUCKETS = 10_000; // hit-timestamp map cap (rateLimit.ts pattern)
const MAX_BLOCKED = 10_000; // blocked-IP map cap — both must stay bounded

type Category = 'sqli' | 'xss' | 'path_traversal' | 'command_injection';

const PATTERNS: ReadonlyArray<{ category: Category; pattern: RegExp }> = [
  // SQLi
  { category: 'sqli', pattern: /union\s+select/i },
  { category: 'sqli', pattern: /'\s*or\s+1\s*=\s*1/i },
  { category: 'sqli', pattern: /sleep\s*\(/i },
  { category: 'sqli', pattern: /benchmark\s*\(/i },
  { category: 'sqli', pattern: /information_schema/i },
  // XSS
  { category: 'xss', pattern: /<script/i },
  { category: 'xss', pattern: /javascript:/i },
  { category: 'xss', pattern: /onerror\s*=/i },
  { category: 'xss', pattern: /onload\s*=/i },
  // Traversal / null byte (raw originalUrl keeps %2e%2e visible)
  { category: 'path_traversal', pattern: /\.\.\// },
  { category: 'path_traversal', pattern: /%2e%2e/i },
  { category: 'path_traversal', pattern: /\u0000|%00/i },
  // Command injection
  { category: 'command_injection', pattern: /;\s*(?:cat|curl|nc|wget)\s/i },
  { category: 'command_injection', pattern: /\|\s*nc\s/i },
];

const EXEMPT_PATHS = ['/api/health', '/api/realtime/stream'];

const hitsByIp = new Map<string, number[]>(); // ip -> suspicious-hit timestamps
const blockedUntil = new Map<string, number>(); // ip -> unblock epoch ms

function pruneBlocked(now: number): void {
  if (blockedUntil.size < MAX_BLOCKED) return;
  for (const [ip, until] of blockedUntil) {
    if (now >= until) blockedUntil.delete(ip);
    if (blockedUntil.size < MAX_BLOCKED) break;
  }
}

function pruneHits(now: number): void {
  if (hitsByIp.size < MAX_BUCKETS) return;
  for (const [ip, timestamps] of hitsByIp) {
    const recent = timestamps.filter((time) => now - time < BLOCK_WINDOW_MS);
    if (recent.length === 0) hitsByIp.delete(ip);
    else hitsByIp.set(ip, recent);
    if (hitsByIp.size < MAX_BUCKETS) break;
  }
}

function safeStringify(value: unknown, budget: number): string {
  if (value === undefined || value === null) return '';
  try {
    const text = JSON.stringify(value);
    return typeof text === 'string' ? text.slice(0, budget) : '';
  } catch {
    return ''; // circular/unserializable — the URL portion is still scanned
  }
}

/** First matching category across URL, query, and body — bounded to SCAN_CAP. */
function categorize(req: Request): Category | null {
  const parts: string[] = [];
  let budget = SCAN_CAP;

  const url = req.originalUrl.slice(0, budget);
  parts.push(url);
  budget -= url.length;

  // Also scan the percent-decoded URL (best-effort): payloads in path
  // segments (`union%20select`) never surface in req.query, and decoding
  // the 8 KB slice keeps this CPU-bounded — a malformed escape just means
  // the raw form above was already scanned.
  if (budget > 0) {
    let decoded = '';
    try {
      decoded = decodeURIComponent(url);
    } catch {
      decoded = '';
    }
    const piece = decoded.slice(0, budget);
    if (piece && piece !== url) {
      parts.push(piece);
      budget -= piece.length;
    }
  }

  if (budget > 0) {
    const query = safeStringify(req.query, budget);
    parts.push(query);
    budget -= query.length;
  }
  if (budget > 0 && req.body !== undefined) {
    parts.push(safeStringify(req.body, budget));
  }

  const haystack = parts.join('\n');
  for (const { category, pattern } of PATTERNS) {
    if (pattern.test(haystack)) return category;
  }
  return null;
}

export function suspiciousRequest(req: Request, res: Response, next: NextFunction): void {
  if (EXEMPT_PATHS.includes(req.path)) {
    next();
    return;
  }

  const now = Date.now();
  const ip = req.ip || 'unknown';

  // Active block short-circuits before scanning: an IP that hit the block
  // threshold is blocked entirely (except exempt paths) for the window —
  // otherwise the block would be sidestepped by simply sending clean URLs.
  const unblockAt = blockedUntil.get(ip);
  if (unblockAt !== undefined) {
    if (now < unblockAt) {
      logger.warn('suspicious_request_rejected', { ip, path: req.originalUrl.slice(0, 300), requestId: req.requestId });
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((unblockAt - now) / 1000))));
      res.status(403).json({
        error: { code: 'SUSPICIOUS_REQUEST_BLOCKED', message: 'Request blocked after repeated suspicious activity.' },
      });
      return;
    }
    blockedUntil.delete(ip);
  }

  const category = categorize(req);
  if (!category) {
    next();
    return;
  }

  logger.warn('suspicious_request', {
    ip,
    path: req.originalUrl.slice(0, 300),
    category,
    requestId: req.requestId,
  });

  // Record the hit in a bounded bucket (rateLimit.ts pattern).
  pruneHits(now);
  const existing = hitsByIp.get(ip);
  let recent: number[];
  if (existing) {
    recent = existing.filter((time) => now - time < BLOCK_WINDOW_MS);
  } else if (hitsByIp.size < MAX_BUCKETS) {
    recent = [];
  } else {
    // Hard cap: cleanup could not free a slot — the hit above is still
    // logged, but skip accounting rather than grow the map without bound.
    next();
    return;
  }
  recent.push(now);
  hitsByIp.set(ip, recent);

  // Block threshold: >= BLOCK_HITS suspicious hits in BLOCK_WINDOW_MS.
  if (recent.length >= BLOCK_HITS) {
    pruneBlocked(now);
    if (blockedUntil.size < MAX_BLOCKED || blockedUntil.has(ip)) {
      blockedUntil.set(ip, now + BLOCK_MS);
    }
    logger.warn('suspicious_request_blocked', { ip, hits: recent.length, windowMs: BLOCK_WINDOW_MS });
    res.setHeader('Retry-After', String(Math.ceil(BLOCK_MS / 1000)));
    res.status(403).json({
      error: { code: 'SUSPICIOUS_REQUEST_BLOCKED', message: 'Request blocked after repeated suspicious activity.' },
    });
    return;
  }

  // Escalation threshold: >= ESCALATE_HITS in HIT_WINDOW_MS. This is where
  // a SecurityEvent row would be recorded if SecurityEventType had a fitting
  // value — it does not (see header comment), so the escalation is marked in
  // the structured file log instead, alongside the per-hit warn above.
  const inHitWindow = recent.filter((time) => now - time < HIT_WINDOW_MS);
  if (inHitWindow.length >= ESCALATE_HITS) {
    logger.warn('suspicious_request_escalation', { ip, category, hitsIn10m: inHitWindow.length });
  }

  next();
}
