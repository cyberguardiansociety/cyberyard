import { createHash, createHmac, randomBytes } from 'crypto';
import { env } from '../config/env';

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Public session handle: deterministic, opaque, and not the raw cookie token. */
export function publicSessionId(sessionToken: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(sessionToken, 'utf8').digest('hex');
}
