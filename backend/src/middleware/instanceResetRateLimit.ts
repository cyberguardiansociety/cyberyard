import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';

/**
 * Hard cap on challenge-instance resets:5 per authenticated user per minute.
 * A reset restarts/wipes a challenge's state, so it is deliberately stricter
 * than the general admin mutation window (adminRateLimit,60/min). Same
 * bounded-memory sliding-window pattern as the existing flag/community
 * limiters: expired buckets are pruned, a new bucket is refused at the hard
 * cap, so the map can never grow without bound.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;
const attempts = new Map<string, number[]>();
const MAX_BUCKETS = 5_000;

function cleanup(now: number): void {
  if (attempts.size < MAX_BUCKETS) return;
  for (const [key, timestamps] of attempts) {
    const recent = timestamps.filter((time) => now - time < WINDOW_MS);
    if (recent.length === 0) attempts.delete(key);
    else attempts.set(key, recent);
    if (attempts.size < MAX_BUCKETS) break;
  }
}

export function instanceResetRateLimit(req: Request, _res: Response, next: NextFunction): void {
  // Must run after requireAuth, so req.user is guaranteed to be set.
  const userId = req.user?.id;
  if (!userId) {
    next(new ApiError(401, 'You must be logged in to do that', 'UNAUTHENTICATED'));
    return;
  }

  const now = Date.now();
  cleanup(now);
  const key = `instance-reset:${userId}`;
  const existing = attempts.get(key);
  let recent: number[];
  if (existing) {
    recent = existing.filter((time) => now - time < WINDOW_MS);
  } else if (attempts.size < MAX_BUCKETS) {
    recent = [];
  } else {
    // Hard cap: cleanup could not free a slot, so refuse to create another
    // bucket — the map must never grow without bound.
    next(new ApiError(429, 'Too many instance resets — please wait a moment and try again.', 'RATE_LIMITED'));
    return;
  }
  if (recent.length >= MAX_REQUESTS) {
    next(new ApiError(429, 'Too many instance resets — please wait a moment and try again.', 'RATE_LIMITED'));
    return;
  }

  recent.push(now);
  attempts.set(key, recent);
  next();
}
