import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

/**
 * A single shared PrismaClient instance for the whole process.
 *
 * In dev, `tsx watch` re-executes this module on every file change, which
 * can otherwise exhaust the database connection pool by creating a new
 * PrismaClient on every reload. Caching the instance on `globalThis` in
 * non-production avoids that — this is Prisma's own documented pattern.
 */
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

/**
 * Apply SQLite durability/concurrency settings without making startup depend
 * on them. WAL lets read-heavy SSE/logging work proceed while a write is in
 * progress, and busy_timeout absorbs short lock contention. Both pragmas are
 * best-effort: a filesystem that cannot switch journal modes should not stop
 * the application from booting, so failures are intentionally ignored.
 */
async function applySqlitePragmas(): Promise<void> {
  // These are fixed, internal SQLite statements (never request data). Bind the
  // Prisma method once so the calls remain explicitly fail-open while the raw
  // SQL is kept in one auditable place.
  const queryRawUnsafe = prisma.$queryRawUnsafe.bind(prisma);
  try {
    await queryRawUnsafe('PRAGMA journal_mode=WAL');
    await queryRawUnsafe('PRAGMA busy_timeout=5000');
  } catch {
    // Fail open: the Prisma client remains usable even when a PRAGMA cannot
    // be applied (for example, a read-only or unusual SQLite filesystem).
  }
}

void applySqlitePragmas();
