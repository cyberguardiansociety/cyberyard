import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { hashPassword, verifyPassword } from '../utils/password';
import { toPublicUser, PublicUser } from './user.service';
import { createSessionForUser, CreatedSession, destroySession, listSafeSessions, revokeOtherSessions, revokeSessionByPublicId } from './session.service';
import { RegisterInput, LoginInput } from '../validation/auth.schema';
import { generateOpaqueToken, hashOpaqueToken } from '../utils/secureToken';
import { sendEmailVerificationEmail, sendPasswordResetEmail } from './email.service';
import { recordSecurityEvent } from './securityEvent.service';
import { createActivity, recordActivity } from './activity.service';
import { logger } from '../utils/logger';
import { SecurityEventType, UserActivityType } from '../constants/enums';

const RESET_TTL_MS = 30 * 60 * 1000;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

// A real argon2id hash of a throwaway value, verified against when the email
// does not exist so login attempts take the same password-hashing time
// whether or not an account matches — response timing must not act as a
// user-enumeration oracle. Never used to grant access: verification "succeeds"
// only to equalize timing, and the same generic 401 is always thrown.
const TIMING_DECOY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$3Ga7y1dBqVR4Vq5Lk3VF9w$uBuQAwkek1Qssi5MBza2y0l4qkIdNf6jSxSStyP8J08';

export interface RequestMeta { userAgent?: string | null; ipAddress?: string | null; }
export interface AuthResult { user: PublicUser; session: CreatedSession; }

export async function registerUser(input: RegisterInput): Promise<{ created: boolean }> {
  const passwordHash = await hashPassword(input.password);
  const [existingByEmail, existingByUsername] = await Promise.all([
    prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }),
    prisma.user.findFirst({ where: { username: { equals: input.username } }, select: { id: true } }),
  ]);

  // Do not disclose which registration field already exists.
  if (existingByEmail || existingByUsername) return { created: false };

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { username: input.username, email: input.email, passwordHash, profile: { create: {} }, settings: { create: {} } },
        include: { profile: true },
      });
      await createActivity(tx, {
        userId: created.id,
        type: UserActivityType.ACCOUNT_REGISTERED,
        description: 'Created an account on CyberYardHub.',
      });
      return created;
    });
  } catch (error) {
    // Concurrent registration race: keep the same generic response rather
    // than turning a unique constraint into an enumeration oracle.
    if ((error as { code?: string })?.code === 'P2002') return { created: false };
    throw error;
  }

  const rawToken = generateOpaqueToken();
  await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  await prisma.emailVerificationToken.create({
    data: { userId: user.id, tokenHash: hashOpaqueToken(rawToken), expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS) },
  });

  void sendEmailVerificationEmail(user.email, rawToken).catch((error: unknown) => {
    logger.error('Verification email send failed', { userId: user.id, error: error instanceof Error ? error.message : String(error) });
  });

  return { created: true };
}

export async function loginUser(input: LoginInput, meta: RequestMeta, existingToken?: string): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email }, include: { profile: true } });
  const invalidCredentialsError = new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  if (!user) {
    // Run a full argon2 verification against a decoy hash so unknown-email
    // logins cost the same time as wrong-password logins (timing oracle).
    await verifyPassword(TIMING_DECOY_PASSWORD_HASH, input.password);
    await recordSecurityEvent(SecurityEventType.LOGIN_FAILURE, meta);
    throw invalidCredentialsError;
  }

  const passwordMatches = await verifyPassword(user.passwordHash, input.password);
  if (!passwordMatches) {
    await recordSecurityEvent(SecurityEventType.LOGIN_FAILURE, { ...meta, userId: user.id });
    throw invalidCredentialsError;
  }

  if (existingToken) await destroySession(existingToken);
  const updatedUser = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() }, include: { profile: true } });
  const session = await createSessionForUser({ userId: user.id, rememberMe: input.rememberMe, userAgent: meta.userAgent, ipAddress: meta.ipAddress });
  await recordSecurityEvent(SecurityEventType.LOGIN_SUCCESS, { ...meta, userId: user.id });
  await recordActivity({ userId: user.id, type: UserActivityType.LOGIN_SUCCESS, description: 'Signed in successfully.' });
  return { user: toPublicUser(updatedUser), session };
}

export async function requestPasswordReset(email: string, meta: RequestMeta): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (user) {
    const rawToken = generateOpaqueToken();
    // Rotate atomically: a crash between delete and create must not leave
    // the account without a (single) outstanding reset token.
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
      prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashOpaqueToken(rawToken), expiresAt: new Date(Date.now() + RESET_TTL_MS) } }),
    ]);
    void sendPasswordResetEmail(user.email, rawToken).catch((error: unknown) => {
      logger.error('Password reset email send failed', { userId: user.id, error: error instanceof Error ? error.message : String(error) });
    });
  }
  // Same security-event write shape for existing and non-existing accounts.
  await recordSecurityEvent(SecurityEventType.PASSWORD_RESET_REQUEST, { ...meta, userId: user?.id ?? null });
}

export async function completePasswordReset(token: string, newPassword: string): Promise<void> {
  const tokenHash = hashOpaqueToken(token);
  const now = new Date();
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    const record = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt <= now) throw new ApiError(400, 'This reset link is invalid or has expired.', 'INVALID_RESET_TOKEN');
    const consumed = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (consumed.count !== 1) throw new ApiError(400, 'This reset link is invalid or has expired.', 'INVALID_RESET_TOKEN');
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: record.userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId: record.userId, id: { not: record.id } } });
    await tx.securityEvent.create({ data: { type: SecurityEventType.PASSWORD_RESET_COMPLETION, userId: record.userId } });
    await createActivity(tx, { userId: record.userId, type: UserActivityType.PASSWORD_RESET_COMPLETED, description: 'Completed a password reset.' });
  });
}

export async function verifyEmail(token: string): Promise<void> {
  const tokenHash = hashOpaqueToken(token);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const record = await tx.emailVerificationToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt <= now) throw new ApiError(400, 'This verification link is invalid or has expired.', 'INVALID_VERIFICATION_TOKEN');
    const consumed = await tx.emailVerificationToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (consumed.count !== 1) throw new ApiError(400, 'This verification link is invalid or has expired.', 'INVALID_VERIFICATION_TOKEN');
    await tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: now } });
    await tx.emailVerificationToken.deleteMany({ where: { userId: record.userId, id: { not: record.id } } });
    await tx.securityEvent.create({ data: { type: SecurityEventType.EMAIL_VERIFICATION, userId: record.userId } });
    await createActivity(tx, { userId: record.userId, type: UserActivityType.EMAIL_VERIFIED, description: 'Verified the account email address.' });
  });
}

export async function resendVerification(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, emailVerifiedAt: true } });
  if (!user || user.emailVerifiedAt) return;
  const rawToken = generateOpaqueToken();
  await prisma.emailVerificationToken.deleteMany({ where: { userId, usedAt: null } });
  await prisma.emailVerificationToken.create({ data: { userId, tokenHash: hashOpaqueToken(rawToken), expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS) } });
  void sendEmailVerificationEmail(user.email, rawToken).catch((error: unknown) => {
    logger.error('Verification email send failed', { userId, error: error instanceof Error ? error.message : String(error) });
  });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string, currentToken: string, meta: RequestMeta): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) throw new ApiError(401, 'Current password is incorrect.', 'INVALID_CURRENT_PASSWORD');
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await revokeOtherSessions(userId, currentToken);
  await recordSecurityEvent(SecurityEventType.PASSWORD_CHANGE, { ...meta, userId });
  await recordActivity({ userId, type: UserActivityType.PASSWORD_CHANGED, description: 'Changed the account password.' });
}

export async function listSessions(userId: string, currentToken: string | undefined) { return listSafeSessions(userId, currentToken); }
export async function revokeOneSession(userId: string, publicId: string, currentToken: string): Promise<void> {
  const revoked = await revokeSessionByPublicId(userId, publicId, currentToken);
  if (!revoked) throw new ApiError(404, 'Session not found.', 'SESSION_NOT_FOUND');
  await recordSecurityEvent(SecurityEventType.SESSION_REVOKED, { userId });
  await recordActivity({ userId, type: UserActivityType.SESSION_REVOKED, description: 'Revoked an active session.' });
}
export async function revokeAllOtherSessions(userId: string, currentToken: string): Promise<number> {
  const count = await revokeOtherSessions(userId, currentToken);
  if (count) {
    await recordSecurityEvent(SecurityEventType.SESSION_REVOKED, { userId });
    await recordActivity({ userId, type: UserActivityType.SESSION_REVOKED, description: `Revoked ${count} other active session${count === 1 ? '' : 's'}.`, metadata: { count } });
  }
  return count;
}
