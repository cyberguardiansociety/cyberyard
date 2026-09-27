import { PublicUser } from '../services/user.service';

/**
 * Augments Express's Request type with `user`, set by the auth middleware
 * once a valid session cookie has been resolved. Left undefined on
 * requests that never passed through auth middleware (public routes) or
 * where no valid session was found.
 */
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: PublicUser;
    }
  }
}

export {};
