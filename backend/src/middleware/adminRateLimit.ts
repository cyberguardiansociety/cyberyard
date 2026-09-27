import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;
const buckets = new Map<string, number[]>();
const MAX_BUCKETS = 5_000;

function cleanup(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, timestamps] of buckets) {
    const recent = timestamps.filter((time) => now - time < WINDOW_MS);
    if (recent.length === 0) buckets.delete(key);
    else buckets.set(key, recent);
    if (buckets.size < MAX_BUCKETS) break;
  }
}

/**
 * Adds a modest guard around state-changing administrator actions.
 * Reads are intentionally not rate limited here; mutations are limited per
 * authenticated admin account so one operator cannot accidentally create a
 * runaway write loop. This is an in-memory single-process control, matching
 * the existing flag/community limiters and documented deployment model.
 */
export function adminRateLimit(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const userId = req.user?.id;
  if (!userId) {
    next(new ApiError(401, 'You must be logged in to do that', 'UNAUTHENTICATED'));
    return;
  }

  const now = Date.now();
  cleanup(now);
  const existing = buckets.get(userId);
  let recent: number[];
  if (existing) {
    recent = existing.filter((time) => now - time < WINDOW_MS);
  } else if (buckets.size < MAX_BUCKETS) {
    recent = [];
  } else {
    // Hard cap: cleanup could not free a slot, so refuse to create another
    // bucket — the map must never grow without bound.
    next(new ApiError(429, 'Too many administrator actions — please wait a moment and try again.', 'RATE_LIMITED'));
    return;
  }
  if (recent.length >= MAX_REQUESTS) {
    next(new ApiError(429, 'Too many administrator actions — please wait a moment and try again.', 'RATE_LIMITED'));
    return;
  }

  recent.push(now);
  buckets.set(userId, recent);
  next();
}
