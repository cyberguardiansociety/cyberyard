import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';

/**
 * Guards admin-only routes. Authentication is handled separately by
 * requireAuth; this middleware checks the role resolved from the current
 * server-side session. The frontend is never trusted for authorization.
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new ApiError(401, 'You must be logged in to do that', 'UNAUTHENTICATED'));
    return;
  }

  if (req.user.role !== 'ADMIN') {
    next(new ApiError(403, 'Administrator access is required', 'FORBIDDEN'));
    return;
  }

  next();
}
