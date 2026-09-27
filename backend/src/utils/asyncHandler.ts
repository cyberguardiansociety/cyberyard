import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async route/controller function so a rejected promise is passed
 * to `next(err)` automatically instead of crashing the process or hanging
 * the request. Express does not do this for async handlers by default.
 *
 * Usage (from Phase 2 onward, once real controllers exist):
 *   router.get('/things', asyncHandler(thingsController.list));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
