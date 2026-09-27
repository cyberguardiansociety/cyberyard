import { Prisma } from '@prisma/client';
import { Role } from '../constants/enums';

type UserWithProfile = Prisma.UserGetPayload<{ include: { profile: true } }>;
type UserRow = Prisma.UserGetPayload<Record<string, never>>;

/**
 * The only shape of a user that's ever allowed to leave this API.
 * Deliberately does NOT include passwordHash, and deliberately does not
 * include anything session-related — those never belong in a response
 * body at all, only in the httpOnly cookie.
 */
export interface PublicUser {
  id: string;
  username: string;
  email: string;
  role: Role;
  createdAt: Date;
  lastLoginAt: Date | null;
  emailVerifiedAt: Date | null;
  emailVerified: boolean;
  profile: {
    bio: string | null;
    avatarUrl: string | null;
  } | null;
}

/**
 * Converts a raw Prisma User row (optionally with its profile included)
 * into the public-safe shape above. Every controller that returns a user
 * — register, login, /me, future profile endpoints — must go through this
 * function rather than returning a Prisma row directly, so a stray
 * `res.json(user)` can never accidentally leak `passwordHash`.
 */
export function toPublicUser(user: UserWithProfile | UserRow): PublicUser {
  const profile = 'profile' in user ? user.profile : null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role as Role,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    emailVerifiedAt: user.emailVerifiedAt,
    emailVerified: !!user.emailVerifiedAt,
    profile: profile ? { bio: profile.bio, avatarUrl: profile.avatarUrl } : null,
  };
}
