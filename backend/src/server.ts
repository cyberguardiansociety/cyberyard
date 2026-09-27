import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './utils/prisma';
import { logger } from './utils/logger';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info('CyberYardHub backend started', { port: env.PORT, environment: env.NODE_ENV });
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.info('Health endpoint available', { path: '/api/health', readiness: '/api/health/ready' });
});

/**
 * Graceful shutdown: stop accepting new connections and close the Prisma
 * connection pool cleanly on process termination (Ctrl+C, container stop,
 * deploy restart), instead of dropping connections abruptly.
 */
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}, shutting down gracefully...`);

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out');
    process.exit(1);
  }, 15_000);
  forceExit.unref();

  server.close(async () => {
    try {
      await prisma.$disconnect();
      clearTimeout(forceExit);
      logger.info('Shutdown complete.');
      process.exit(0);
    } catch {
      clearTimeout(forceExit);
      logger.error('Database disconnect failed during shutdown');
      process.exit(1);
    }
  });
}

server.on('error', (error) => {
  const err = error as NodeJS.ErrnoException;
  if (err?.code === 'EADDRINUSE') {
    // Previously this logged only a generic message, so a port collision
    // looked exactly like broken authentication: the frontend kept posting
    // /api/auth/* to whatever unrelated app owned the port and every login
    // and registration attempt failed. Say exactly what happened and how to
    // fix it.
    logger.error(`Port ${env.PORT} is already in use by another process`, {
      port: env.PORT,
      hint: 'Stop the other process, or run `npm run dev` from the repository root — it relocates the API to a free port automatically and points the frontend at it.',
    });
    process.exit(1);
  }
  logger.error('HTTP server failed to start or stopped unexpectedly', {
    errorName: error instanceof Error ? error.name : 'ServerError',
    code: err?.code,
  });
  process.exit(1);
});

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
