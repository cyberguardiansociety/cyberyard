import { prisma } from '../utils/prisma';
import { generateSessionToken } from '../utils/sessionToken';
import { hashOpaqueToken } from '../utils/secureToken';

export interface SessionRecord {
  id: string;
  userId: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
}

export interface CreateSessionInput {
  userId: string;
  ttlMs: number;
  userAgent?: string | null;
  ipAddress?: string | null;
}

/**
 * Postgres-backed session store.
 *
 * Id contract: every id exchanged with this store (find/delete/
 * deleteForUserExcept/listForUser results) is the STORED form — a SHA-256
 * hash of the raw cookie token — so tokens are never persisted in plaintext.
 * `session.service.ts` converts raw cookie tokens to their stored form at
 * the boundary. The one exception is `create()`, which generates the raw
 * token, persists only its hash, and returns the raw token for the cookie.
 */
export interface SessionStore {
  create(input: CreateSessionInput): Promise<{ session: SessionRecord; token: string }>;
  find(id: string): Promise<SessionRecord | null>;
  delete(id: string): Promise<void>;
  deleteExpired(): Promise<number>;
  listForUser(userId: string): Promise<SessionRecord[]>;
  deleteForUserExcept(userId: string, keepId: string): Promise<number>;
}

class PrismaSessionStore implements SessionStore {
  async create(input: CreateSessionInput): Promise<{ session: SessionRecord; token: string }> {
    const now = Date.now();
    const rawToken = generateSessionToken();
    const session = await prisma.session.create({
      data: {
        // Hash at rest: a leaked sessions table must not yield usable cookies.
        id: hashOpaqueToken(rawToken),
        userId: input.userId,
        userAgent: input.userAgent ?? null,
        ipAddress: input.ipAddress ?? null,
        lastActivityAt: new Date(now),
        expiresAt: new Date(now + input.ttlMs),
      },
    });
    return { session, token: rawToken };
  }

  async find(id: string): Promise<SessionRecord | null> {
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return null;
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.delete(id);
      return null;
    }
    // Avoid turning every request into a write while still providing a useful
    // last-activity timestamp for session management.
    if (Date.now() - session.lastActivityAt.getTime() >= 60_000) {
      return prisma.session.update({ where: { id }, data: { lastActivityAt: new Date() } });
    }
    return session;
  }

  async delete(id: string): Promise<void> {
    await prisma.session.deleteMany({ where: { id } });
  }

  async deleteExpired(): Promise<number> {
    const result = await prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    return result.count;
  }

  async listForUser(userId: string): Promise<SessionRecord[]> {
    return prisma.session.findMany({ where: { userId, expiresAt: { gt: new Date() } }, orderBy: { lastActivityAt: 'desc' } });
  }

  async deleteForUserExcept(userId: string, keepId: string): Promise<number> {
    const result = await prisma.session.deleteMany({ where: { userId, id: { not: keepId } } });
    return result.count;
  }
}

export const sessionStore: SessionStore = new PrismaSessionStore();
