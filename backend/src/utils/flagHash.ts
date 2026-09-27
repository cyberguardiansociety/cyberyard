import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../config/env';

/**
 * Flag hashing is deliberately NOT Argon2/bcrypt like passwords.
 *
 * Passwords are hashed with a slow, per-hash-salted algorithm because
 * they're compared once per login and a leaked hash must resist offline
 * cracking of a low-entropy human-chosen secret. Flags are compared far
 * more often (every submission, potentially many per second across many
 * players) and this project's own architecture plan calls for a keyed
 * hash (HMAC-SHA256) specifically for that reason: it's fast, fully
 * deterministic (so a hash can be looked up/compared directly), and still
 * unrecoverable without the server-side secret if the database leaks.
 *
 * Normalization (trim, optional case-folding) happens in exactly one
 * place — here — so hashing a flag at seed/admin-write time and verifying
 * a submission always treat "same flag, different casing/whitespace" the
 * same way.
 */
function normalize(value: string, caseSensitive: boolean): string {
  const trimmed = value.trim();
  return caseSensitive ? trimmed : trimmed.toLowerCase();
}

/** Used when storing a challenge's correct flag (admin/seed time only). */
export function hashFlag(rawFlag: string, caseSensitive: boolean): string {
  return createHmac('sha256', env.FLAG_HASH_SECRET).update(normalize(rawFlag, caseSensitive)).digest('hex');
}

/**
 * Used when checking a player's submission against the stored hash.
 * Uses a timing-safe comparison so response time can't be used to infer
 * how much of the flag was correct.
 */
export function verifyFlag(submittedValue: string, storedHash: string, caseSensitive: boolean): boolean {
  const candidateHash = hashFlag(submittedValue, caseSensitive);

  const candidateBuf = Buffer.from(candidateHash, 'hex');
  const storedBuf = Buffer.from(storedHash, 'hex');
  if (candidateBuf.length !== storedBuf.length) return false;

  return timingSafeEqual(candidateBuf, storedBuf);
}

/**
 * A keyed hash (HMAC-SHA256 with the existing FLAG_HASH_SECRET) used only to
 * log what a user typed in the submissions audit table — NOT for security
 * comparison (that's `verifyFlag` above). Keeping a hash instead of the raw
 * guess means the submissions table can't become a second place real flag
 * values leak from, while still letting abuse review see "did they resubmit
 * the exact same wrong guess 500 times" without storing plaintext. Keyed so
 * a leaked database alone still can't be used to confirm guessed flags by
 * hashing candidates offline.
 */
export function hashSubmissionForAudit(rawValue: string): string {
  return createHmac('sha256', env.FLAG_HASH_SECRET).update(rawValue.trim()).digest('hex');
}

/**
 * Per-user dynamic flag derivation (FlagMode.DYNAMIC challenges).
 *
 * HMAC-SHA256 with the same server-side FLAG_HASH_SECRET used everywhere
 * else in this file, keyed over `userId:challengeId`, rendered as a
 * flag-looking string (`cyh{32 hex chars}`). Because the input includes
 * the user id, every account gets a different flag for the same challenge
 * and a leaked flag only validates for the account it was shown to.
 * Deterministic, so the value can be re-derived on demand — it is never
 * stored, and only the requesting user's own derived value is ever
 * returned by the challenge detail API.
 */
export function deriveDynamicFlag(userId: string, challengeId: string): string {
  const digest = createHmac('sha256', env.FLAG_HASH_SECRET)
    .update(`dynamic-flag:${userId}:${challengeId}`)
    .digest('hex');
  return `cyh{${digest.slice(0, 32)}}`;
}
