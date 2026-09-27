import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';

const WINDOW_MS = 60_000;
const LIMITS: Record<string, number> = { registration: 10, event: 20, announcement: 20, admin: 40 };
const attempts = new Map<string, number[]>();
const MAX_BUCKETS = 5000;

function cleanup(now: number): void {
  if (attempts.size < MAX_BUCKETS) return;
  for (const [key, timestamps] of attempts) {
    const recent = timestamps.filter((time) => now - time < WINDOW_MS);
    if (recent.length) attempts.set(key, recent); else attempts.delete(key);
    if (attempts.size < MAX_BUCKETS) break;
  }
}

export function eventRateLimit(kind = 'event') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const userId = req.user?.id;
    if (!userId) return next(new ApiError(401, 'You must be logged in to do that', 'UNAUTHENTICATED'));
    const now = Date.now(); cleanup(now);
    const key = `${kind}:${userId}`;
    const existing = attempts.get(key);
    let recent: number[];
    if (existing) {
      recent = existing.filter((time) => now - time < WINDOW_MS);
    } else if (attempts.size < MAX_BUCKETS) {
      recent = [];
    } else {
      // Hard cap: cleanup could not free a slot, so refuse to create another
      // bucket — the map must never grow without bound.
      return next(new ApiError(429, 'Too many event actions — please wait a moment and try again.', 'RATE_LIMITED'));
    }
    if (recent.length >= (LIMITS[kind] ?? LIMITS.event)) return next(new ApiError(429, 'Too many event actions — please wait a moment and try again.', 'RATE_LIMITED'));
    recent.push(now); attempts.set(key, recent); next();
  };
}
