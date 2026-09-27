import { prisma } from '../utils/prisma';
import { SecurityEventType } from '../constants/enums';
import { logger } from '../utils/logger';

export interface SecurityEventMeta {
  userId?: string | null;
  targetChallengeId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Security events contain operational metadata only — never passwords,
 * session tokens, reset tokens, verification tokens, plaintext flags, or
 * uploaded file contents. */
export async function recordSecurityEvent(type: SecurityEventType, meta: SecurityEventMeta = {}): Promise<void> {
  try {
    await prisma.securityEvent.create({
      data: {
        type,
        userId: meta.userId ?? null,
        targetChallengeId: meta.targetChallengeId ?? null,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ? meta.userAgent.slice(0, 512) : null,
      },
    });
  } catch {
    logger.error('Security event write failed', { type });
  }
}
