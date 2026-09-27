import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function configuredOrigins(): Set<string> {
  return new Set(env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean));
}

/**
 * Browser-side CSRF defense for cookie-authenticated state changes.
 * SameSite=Lax is the first layer; this Origin/Referer check adds an explicit
 * server-side boundary for same-site/cross-origin browser requests as well.
 * Requests without browser origin metadata (neither Origin nor Referer) are
 * rejected for state-changing methods: a legitimate browser always sends at
 * least one of them on POST/PUT/PATCH/DELETE, so their absence indicates a
 * forged or non-conforming client. When present, Origin/Referer must match
 * an explicitly configured frontend origin.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.get('origin');
  const referer = req.get('referer');
  const allowed = configuredOrigins();

  if (!origin && !referer) {
    next(new ApiError(403, 'Request origin is not allowed.', 'CSRF_ORIGIN_REJECTED'));
    return;
  }

  if (origin) {
    if (!allowed.has(origin)) {
      next(new ApiError(403, 'Request origin is not allowed.', 'CSRF_ORIGIN_REJECTED'));
      return;
    }
    next();
    return;
  }

  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (!allowed.has(refererOrigin)) {
        next(new ApiError(403, 'Request origin is not allowed.', 'CSRF_ORIGIN_REJECTED'));
        return;
      }
    } catch {
      next(new ApiError(403, 'Request origin is not allowed.', 'CSRF_ORIGIN_REJECTED'));
      return;
    }
  }

  next();
}
