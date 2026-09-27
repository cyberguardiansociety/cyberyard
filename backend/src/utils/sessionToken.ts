import { randomBytes } from 'crypto';

/**
 * Generates the opaque, cryptographically random session token handed to
 * the browser as the cookie value. It is never stored directly — the
 * session store persists only a SHA-256 hash of it (see
 * src/services/session.store.ts) — so a leaked database cannot be replayed
 * as a live session.
 *
 * 32 bytes -> 64 hex characters; the stored hash is also 64 hex characters,
 * well within the `id String @db.VarChar(128)` column width in
 * schema.prisma with headroom if the encoding ever changes.
 *
 * @returns the raw token for the cookie
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}
