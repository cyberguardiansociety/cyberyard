import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';

/**
 * A minimal in-memory sliding-window rate limiter for flag submissions.
 *
 * This is intentionally simple and explicitly NOT the final answer: it
 * lives in a single Node process's memory, so it resets on restart and
 * does not coordinate across multiple instances behind a load balancer.
 * That's an acceptable stop-gap for the current single-instance
 * architecture (see README), and it's isolated to this one file so it can
 * be swapped for a Redis-backed limiter (using the same INCR-with-TTL
 * pattern the session store is already documented to move to) without
 * touching the route or controller that uses it.
 *
 * Limits flag submissions per authenticated user (not per IP — IP-based
 * limiting would be trivially shared/bypassed by users behind the same
 * NAT, or unfairly punish them) to WINDOW_MS / MAX_REQUESTS.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

const attemptsByUser = new Map<string, number[]>();
const MAX_BUCKETS = 10_000;

function cleanup(now: number): void {
  if (attemptsByUser.size < MAX_BUCKETS) return;
  for (const [key, timestamps] of attemptsByUser) {
    const recent = timestamps.filter((time) => now - time < WINDOW_MS);
    if (recent.length === 0) attemptsByUser.delete(key);
    else attemptsByUser.set(key, recent);
    if (attemptsByUser.size < MAX_BUCKETS) break;
  }
}

export function flagSubmitRateLimit(req: Request, _res: Response, next: NextFunction): void {
  // Must run after requireAuth, so req.user is guaranteed to be set.
  const userId = req.user?.id;
  if (!userId) {
    next(new ApiError(401, 'You must be logged in to do that', 'UNAUTHENTICATED'));
    return;
  }

  const now = Date.now();
  cleanup(now);
  const existing = attemptsByUser.get(userId);
  let recent: number[];
  if (existing) {
    recent = existing.filter((t) => now - t < WINDOW_MS);
  } else if (attemptsByUser.size < MAX_BUCKETS) {
    recent = [];
  } else {
    // Hard cap: cleanup could not free a slot, so refuse to create another
    // bucket — the map must never grow without bound.
    next(new ApiError(429, 'Too many flag submissions — please wait a moment and try again.', 'RATE_LIMITED'));
    return;
  }

  if (recent.length >= MAX_REQUESTS) {
    next(new ApiError(429, 'Too many flag submissions — please wait a moment and try again.', 'RATE_LIMITED'));
    return;
  }

  recent.push(now);
  attemptsByUser.set(userId, recent);
  next();
}
