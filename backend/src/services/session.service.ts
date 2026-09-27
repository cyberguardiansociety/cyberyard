import { prisma } from '../utils/prisma';
import { sessionStore, SessionRecord } from './session.store';
import { env } from '../config/env';
import { toPublicUser, PublicUser } from './user.service';
import { publicSessionId, hashOpaqueToken } from '../utils/secureToken';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CreateSessionOptions {
  userId: string;
  rememberMe?: boolean;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface CreatedSession {
  token: string;
  expiresAt: Date;
  rememberMe: boolean;
}

export async function createSessionForUser(options: CreateSessionOptions): Promise<CreatedSession> {
  const rememberMe = !!options.rememberMe;
  const ttlDays = rememberMe ? env.SESSION_TTL_REMEMBER_DAYS : env.SESSION_TTL_DAYS;
  const { session, token } = await sessionStore.create({
    userId: options.userId,
    ttlMs: ttlDays * DAY_MS,
    userAgent: options.userAgent,
    ipAddress: options.ipAddress,
  });
  // `token` is the raw value for the cookie; the store kept only its hash.
  return { token, expiresAt: session.expiresAt, rememberMe };
}

export async function resolveSessionUser(token: string | undefined): Promise<PublicUser | null> {
  if (!token) return null;
  // The store looks up by stored id, so hash the raw cookie token first.
  const session: SessionRecord | null = await sessionStore.find(hashOpaqueToken(token));
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, include: { profile: true } });
  if (!user) return null;
  return toPublicUser(user);
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await sessionStore.delete(hashOpaqueToken(token));
}

export function toSafeSession(session: SessionRecord, currentToken: string | undefined) {
  return {
    id: publicSessionId(session.id),
    current: !!currentToken && session.id === hashOpaqueToken(currentToken),
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
    expiresAt: session.expiresAt,
    userAgent: session.userAgent,
  };
}

export async function listSafeSessions(userId: string, currentToken: string | undefined) {
  const sessions = await sessionStore.listForUser(userId);
  return sessions.map((session) => toSafeSession(session, currentToken));
}

export async function revokeOtherSessions(userId: string, currentToken: string): Promise<number> {
  return sessionStore.deleteForUserExcept(userId, hashOpaqueToken(currentToken));
}

export async function revokeSessionByPublicId(userId: string, publicId: string, currentToken: string): Promise<boolean> {
  const sessions = await sessionStore.listForUser(userId);
  const target = sessions.find((session) => publicSessionId(session.id) === publicId);
  if (!target) return false;
  if (target.id === hashOpaqueToken(currentToken)) return false;
  await sessionStore.delete(target.id);
  return true;
}
