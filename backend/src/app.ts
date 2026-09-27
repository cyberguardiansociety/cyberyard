import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import apiRouter from './routes';
import { notFound } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';
import { attachUser } from './middleware/auth.middleware';
import { csrfProtection } from './middleware/csrf.middleware';
import { globalRateLimit } from './middleware/globalRateLimit';
import { suspiciousRequest } from './middleware/suspiciousRequest';
import { randomUUID } from 'crypto';

/**
 * Builds and returns the configured Express app, without starting it.
 * Kept separate from server.ts so it can be imported directly by future
 * integration tests (supertest etc.) without binding a real port.
 */
export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  // TRUST_PROXY (default false): leave false when the app is directly
  // exposed — req.ip is then the real socket peer. Set TRUST_PROXY=true ONLY
  // behind a trusted reverse proxy that overwrites X-Forwarded-For, otherwise
  // clients could spoof their IP and bypass IP-keyed rate limiters. With it
  // false behind a proxy, every client shares the proxy's address for
  // rate-limiting purposes. See .env.example.
  app.set('trust proxy', env.TRUST_PROXY);

  app.use((req, res, next) => {
    const requestId = req.header('x-request-id')?.trim() || randomUUID();
    req.requestId = requestId.slice(0, 128);
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });

  // Security headers on every response.
  app.use(helmet());

  // Only the configured origin(s) may call this API with credentials.
  // CORS_ORIGIN supports a comma-separated list for multiple environments.
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    })
  );

  // Bound request bodies prevent oversized JSON/urlencoded payloads from
  // consuming excessive memory. File uploads have their own multer limit.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  // Signed cookie parsing — SESSION_SECRET here must match the one used
  // when the cookie was set (utils/cookies.ts), or every cookie will fail
  // signature verification and req.signedCookies will be empty.
  app.use(cookieParser(env.SESSION_SECRET));

  // Populates req.user from the session cookie (if any) on every request,
  // before routing. Individual routes still opt into REQUIRING auth via
  // the separate `requireAuth` middleware — this just makes `req.user`
  // available everywhere so a route can behave differently for logged-in
  // vs. guest callers without every route re-parsing the cookie itself.
  app.use(attachUser);
  app.use(csrfProtection);

  // App-wide rate limit (per IP), in addition to the per-route limiters.
  app.use(globalRateLimit);

  // API responses may contain authenticated account/activity data; avoid
  // intermediary/browser caching of the API surface. Public challenge pages
  // remain inexpensive enough to serve without a separate cache layer.
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Suspicious request detection: high-signal SQLi/XSS/traversal/command
  // pattern scan over URL + query + JSON body (bounded to 8 KB per request).
  // Placed after body parsing (it needs the parsed body) and after the
  // app-wide rate limiter (scan CPU stays bounded per IP), immediately
  // before routing. Logs every hit; blocks repeat offenders (see
  // middleware/suspiciousRequest.ts for thresholds and exemptions).
  app.use(suspiciousRequest);

  app.use('/api', apiRouter);

  // Must come after all routes.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
