import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';

type Action = 'passwordReset' | 'verifyEmail' | 'passwordChange';
const WINDOW_MS = 15 * 60 * 1000;
const LIMITS: Record<Action, number> = { passwordReset: 5, verifyEmail: 5, passwordChange: 5 };
const buckets = new Map<string, number[]>();
const MAX_BUCKETS = 20_000;

function cleanup(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, values] of buckets) {
    const recent = values.filter((time) => now - time < WINDOW_MS);
    if (recent.length) buckets.set(key, recent); else buckets.delete(key);
    if (buckets.size < MAX_BUCKETS) break;
  }
}

export function accountSecurityRateLimit(action: Action) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const now = Date.now();
    cleanup(now);
    const identity = (action !== 'passwordReset' ? req.user?.id : null) || req.ip || 'unknown';
    const key = `${action}:${identity}`;
    const existing = buckets.get(key);
    let recent: number[];
    if (existing) {
      recent = existing.filter((time) => now - time < WINDOW_MS);
    } else if (buckets.size < MAX_BUCKETS) {
      recent = [];
    } else {
      // Hard cap: cleanup could not free a slot, so refuse to create another
      // bucket — the map must never grow without bound.
      next(new ApiError(429, 'Too many security requests. Please try again later.', 'RATE_LIMITED'));
      return;
    }
    if (recent.length >= LIMITS[action]) {
      next(new ApiError(429, 'Too many security requests. Please try again later.', 'RATE_LIMITED'));
      return;
    }
    recent.push(now);
    buckets.set(key, recent);
    next();
  };
}
