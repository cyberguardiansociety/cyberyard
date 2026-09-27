import { Request, Response } from 'express';
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema, verifyEmailSchema, changePasswordSchema, sessionIdSchema } from '../validation/auth.schema';
import { registerUser, loginUser, requestPasswordReset, completePasswordReset, verifyEmail, resendVerification, changePassword, listSessions, revokeOneSession, revokeAllOtherSessions } from '../services/auth.service';
import { destroySession } from '../services/session.service';
import { setSessionCookie, clearSessionCookie } from '../utils/cookies';
import { env } from '../config/env';
import { recordSecurityEvent } from '../services/securityEvent.service';
import { ApiError } from '../utils/ApiError';
import { recordAuthFailure, clearAuthFailures, normalizeIdentityEmail } from '../middleware/authTarpit';

function requestMeta(req: Request) { return { userAgent: req.get('user-agent') ?? null, ipAddress: req.ip ?? null }; }
function sessionToken(req: Request): string | undefined { return req.signedCookies?.[env.SESSION_COOKIE_NAME] as string | undefined; }

export async function register(req: Request, res: Response): Promise<void> {
  const input = registerSchema.parse(req.body);
  const identity = normalizeIdentityEmail(input.email);
  try {
    await registerUser(input);
  } catch (err) {
    // Service-layer failures (duplicate-email race, etc.) feed the
    // tarpit/lockout counters so address-harvesting bots get
    // progressively slowed. Zod input errors never reach here.
    recordAuthFailure('register', req.ip ?? null, identity);
    throw err;
  }
  clearAuthFailures('register', req.ip ?? null, identity);
  res.status(202).json({ message: 'If registration can be completed, further instructions will be provided.' });
}

export async function login(req: Request, res: Response): Promise<void> {
  const input = loginSchema.parse(req.body);
  const ip = req.ip ?? null;
  const identity = normalizeIdentityEmail(input.email);
  let result: Awaited<ReturnType<typeof loginUser>>;
  try {
    result = await loginUser(input, requestMeta(req), sessionToken(req));
  } catch (err) {
    // Only genuine credential failures count toward the tarpit and the
    // per-identity lockout — validation errors are already bounded by
    // the route rate limiter, and lockouts must not be tripped by
    // unrelated failures (e.g. unverified email).
    if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
      recordAuthFailure('login', ip, identity);
    }
    throw err;
  }
  clearAuthFailures('login', ip, identity);
  setSessionCookie(res, result.session.token, result.session.expiresAt, result.session.rememberMe);
  res.status(200).json({ user: result.user });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token = sessionToken(req);
  const userId = req.user?.id;
  await destroySession(token);
  if (userId) await recordSecurityEvent('LOGOUT', { ...requestMeta(req), userId });
  clearSessionCookie(res);
  res.status(200).json({ message: 'Logged out' });
}

export async function me(req: Request, res: Response): Promise<void> { res.status(200).json({ user: req.user }); }

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = forgotPasswordSchema.parse(req.body);
  await requestPasswordReset(email, requestMeta(req));
  res.status(202).json({ message: 'If the account exists, further instructions will be provided.' });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const input = resetPasswordSchema.parse(req.body);
  await completePasswordReset(input.token, input.newPassword);
  res.status(200).json({ message: 'Password reset complete. Please log in again.' });
}

export async function verifyEmailAddress(req: Request, res: Response): Promise<void> {
  const input = verifyEmailSchema.parse(req.body);
  await verifyEmail(input.token);
  res.status(200).json({ message: 'Email verified successfully.' });
}

export async function resendVerificationEmail(req: Request, res: Response): Promise<void> {
  await resendVerification(req.user!.id);
  res.status(202).json({ message: 'If your account still needs verification, a new verification email has been sent.' });
}

export async function changeUserPassword(req: Request, res: Response): Promise<void> {
  const input = changePasswordSchema.parse(req.body);
  const token = sessionToken(req);
  if (!token) { res.status(401).json({ error: { message: 'You must be logged in to do that', code: 'UNAUTHENTICATED' } }); return; }
  await changePassword(req.user!.id, input.currentPassword, input.newPassword, token, requestMeta(req));
  res.status(200).json({ message: 'Password changed successfully. Other sessions have been signed out.' });
}

export async function getSessions(req: Request, res: Response): Promise<void> {
  res.status(200).json({ sessions: await listSessions(req.user!.id, sessionToken(req)) });
}

export async function revokeSession(req: Request, res: Response): Promise<void> {
  const { id } = sessionIdSchema.parse(req.params);
  const token = sessionToken(req);
  if (!token) { res.status(401).json({ error: { message: 'You must be logged in to do that', code: 'UNAUTHENTICATED' } }); return; }
  await revokeOneSession(req.user!.id, id, token);
  res.status(204).send();
}

export async function revokeOtherSessions(req: Request, res: Response): Promise<void> {
  const token = sessionToken(req);
  if (!token) { res.status(401).json({ error: { message: 'You must be logged in to do that', code: 'UNAUTHENTICATED' } }); return; }
  const revoked = await revokeAllOtherSessions(req.user!.id, token);
  res.status(200).json({ message: 'Other sessions revoked.', revoked });
}
