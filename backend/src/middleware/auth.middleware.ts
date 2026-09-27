import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { resolveSessionUser } from '../services/session.service';
import { ApiError } from '../utils/ApiError';

/**
 * Reads the signed session cookie, resolves it to a user via the
 * SessionStore, and attaches the result to `req.user`. Does NOT reject the
 * request if there's no valid session — see `requireAuth` below for that.
 * Splitting these lets a future route be "auth-aware but not
 * auth-required" (e.g. showing different content to guests vs. logged-in
 * users on the same public endpoint) without duplicating the cookie-
 * reading logic.
 */
export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.signedCookies?.[env.SESSION_COOKIE_NAME] as string | undefined;
    req.user = (await resolveSessionUser(token)) ?? undefined;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Guards protected routes. Must run after `attachUser` (see app.ts, where
 * `attachUser` runs globally so `req.user` is always populated by the time
 * any route handler — including this one — runs). Rejects with 401 rather
 * than redirecting, since this is an API; the frontend's existing
 * protected-route pattern (redirect to Login with a message) stays a
 * frontend concern once it's wired up to call this API.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new ApiError(401, 'You must be logged in to do that', 'UNAUTHENTICATED'));
    return;
  }
  next();
}
