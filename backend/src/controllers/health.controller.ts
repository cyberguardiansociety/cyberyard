import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

/**
 * GET /api/health
 *
 * The only real endpoint in Phase 1. It exists to prove the server boots,
 * Express routing works end-to-end, and (best-effort) that Prisma can reach
 * SQLite database — without introducing any real domain models yet.
 *
 * Database connectivity is best-effort: if DATABASE_URL points at a
 * database that isn't running yet, this still returns 200 with
 * `database: "unreachable"` rather than failing the whole health check,
 * since during initial local setup it's normal for the DB to come up after
 * the API server.
 */
export async function getHealth(_req: Request, res: Response): Promise<void> {
  let database: 'connected' | 'unreachable' = 'unreachable';

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = 'connected';
  } catch {
    logger.warn('Health check: database not reachable', {
      database: 'unreachable',
    });
  }

  res.status(200).json({
    status: 'ok',
    service: 'cyberyardhub-backend',
    timestamp: new Date().toISOString(),
    database,
  });
}


/**
 * GET /api/health/ready
 * Readiness is intentionally dependency-aware while remaining safe: it only
 * reports whether SQLite can answer a trivial query and never exposes
 * connection strings, credentials, filesystem paths, or environment values.
 */
export async function getReadiness(_req: Request, res: Response): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ready', service: 'cyberyardhub-backend', database: 'connected' });
  } catch {
    logger.warn('Readiness check failed', { database: 'unreachable' });
    res.status(503).json({ status: 'not_ready', service: 'cyberyardhub-backend', database: 'unreachable' });
  }
}
