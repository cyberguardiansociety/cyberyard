import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';

/**
 * App-wide safety net keyed by client IP, layered on top of (not instead of)
 * the per-route limiters — DB-heavy endpoints like the leaderboard CTE get at
 * least this protection even without their own dedicated limiter.
 *
 * Bounded-memory sliding window: expired buckets are pruned once the map is
 * at capacity, and a new bucket is refused at the hard cap so the map can
 * never grow without bound. Accuracy depends on `req.ip`, which is only the
 * real client address when TRUST_PROXY is configured correctly (see
 * config/env.ts and app.ts).
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 300;
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

export function globalRateLimit(req: Request, _res: Response, next: NextFunction): void {
  const now = Date.now();
  cleanup(now);
  const key = req.ip || 'unknown';
  const existing = buckets.get(key);
  let recent: number[];
  if (existing) {
    recent = existing.filter((time) => now - time < WINDOW_MS);
  } else if (buckets.size < MAX_BUCKETS) {
    recent = [];
  } else {
    // Hard cap: cleanup could not free a slot, so refuse to create another
    // bucket — the map must never grow without bound.
    next(new ApiError(429, 'Too many requests. Please try again shortly.', 'RATE_LIMITED'));
    return;
  }
  if (recent.length >= MAX_REQUESTS) {
    next(new ApiError(429, 'Too many requests. Please try again shortly.', 'RATE_LIMITED'));
    return;
  }
  recent.push(now);
  buckets.set(key, recent);
  next();
}
