import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { env } from '../config/env';

/**
 * Single place where every thrown error (from routes, controllers,
 * services, or validation) ends up. Keeps the JSON error shape consistent
 * across the whole API: `{ error: { message, code? } }`.
 *
 * Must be registered LAST, after all routes, per Express's error-handling
 * middleware convention (four-argument signature).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        issues: err.flatten(),
      },
    });
    return;
  }

  // A unique-constraint race (e.g. two concurrent registrations with the
  // same email slipping past the service layer's own pre-check) surfaces
  // here as a Prisma error, not an ApiError. Translate it to the same
  // 409 shape rather than leaking a raw database error message.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    res.status(409).json({
      error: {
        message: 'A record with that value already exists',
        code: 'DUPLICATE',
      },
    });
    return;
  }

  // SQLite reports a short-lived writer collision as P1008 (the engine's
  // timeout/busy path). It is transient, so give callers a retry signal
  // instead of exposing a raw database error or reporting a 500.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P1008') {
    res.set('Retry-After', '1');
    res.status(503).json({
      error: {
        code: 'DB_BUSY',
        message: 'The database is busy — retry shortly.',
      },
    });
    return;
  }

  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logger.error('API error', { requestId: req.requestId, path: req.originalUrl, method: req.method, status: err.statusCode, ...(env.NODE_ENV === 'production' ? {} : { message: err.message, stack: err.stack }) });
    }
    // Throttling responses carry the standard Retry-After header (the
    // limiter's exact remaining window when it supplied one).
    if (err.statusCode === 429) {
      res.set('Retry-After', String(err.retryAfterSeconds ?? 60));
    }
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        ...(err.code ? { code: err.code } : {}),
      },
    });
    return;
  }

  // Unexpected/unknown error — log full detail server-side, but never leak
  // internals (stack traces, driver messages, etc.) to the client.
  const message = err instanceof Error ? err.message : 'Unknown error';
  logger.error('Unhandled error', {
    requestId: req.requestId,
    path: req.originalUrl,
    method: req.method,
    errorName: err instanceof Error ? err.name : 'UnknownError',
    ...(env.NODE_ENV === 'production'
      ? {}
      : { message, stack: err instanceof Error ? err.stack : undefined }),
  });

  res.status(500).json({
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
  });
}
