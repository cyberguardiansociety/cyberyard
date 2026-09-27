import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { TeamRole, UserActivityType } from '../constants/enums';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { createActivity, recordActivity } from './activity.service';
import { TeamListQuery } from '../validation/teams.schema';

/**
 * Team logic. Two things worth stating up front:
 *
 * 1. Platform roles are untouched here — `Role` stays USER/ADMIN. A team
 *    captain has authority ONLY over their own team (invite code, kicks,
 *    dissolve), enforced through TeamMember.role (TeamRole).
 * 2. Team scores are never stored on the teams table. They are computed
 *    on read in SQL (paginated, see teamScoresCte) from members' solves
 *    plus ScoreAdjustment rows, so they cannot drift from source data and
 *    admin point corrections apply for free.
 */

/** Hard cap on members per team (constant, enforced inside the join tx). */
export const TEAM_MEMBER_CAP = 6;

// Invite codes: 12 chars over a 32-character alphabet with I/O/0/1 (and
// other look-alikes) removed. 256 % 32 === 0, so each uniformly random
// byte maps onto one character with zero modulo bias — 60 bits of entropy.
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_CODE_LENGTH = 12;

export interface TeamMemberView {
  userId: string;
  username: string;
  role: TeamRole;
  joinedAt: Date;
}

export interface TeamView {
  id: string;
  name: string;
  slug: string;
  captainId: string;
  createdAt: Date;
  memberCount: number;
  score: number;
  rank: number;
  members: TeamMemberView[];
  /** Only ever populated for the requesting captain (see buildTeamView). */
  inviteCode?: string;
}

export interface TeamScoreRow {
  id: string;
  name: string;
  slug: string;
  captainId: string;
  inviteCode: string;
  createdAt: Date;
  score: number;
  memberCount: number;
  rank: number;
}

type TeamScoreDbRow = {
  id: string;
  name: string;
  slug: string;
  captainId: string;
  inviteCode: string;
  createdAt: Date;
  score: number | bigint;
  memberCount: number | bigint;
  rank: number | bigint;
};

function normalizeTeamScoreRow(row: TeamScoreDbRow): TeamScoreRow {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    captainId: row.captainId,
    inviteCode: row.inviteCode,
    createdAt: row.createdAt,
    score: Number(row.score),
    memberCount: Number(row.memberCount),
    rank: Number(row.rank),
  };
}

/** Public projection: the invite code never leaves admin/captain contexts. */
function toPublicTeamScore(row: TeamScoreRow): Omit<TeamScoreRow, 'inviteCode'> {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    captainId: row.captainId,
    createdAt: row.createdAt,
    memberCount: row.memberCount,
    score: row.score,
    rank: row.rank,
  };
}

/**
 * Shared scoring CTE, composed into every team score query via Prisma.sql
 * (tagged templates — values are bound parameters, never string-concatenated).
 *
 * Score = for each team, SUM over DISTINCT challenges of the members' BEST
 * pointsAwarded on that challenge, plus the team's members' cumulative
 * ScoreAdjustment deltas. Aggregation happens entirely in SQL; no solve
 * rows are materialized in JS.
 */
const teamScoresCte = Prisma.sql`
  WITH best_per_challenge AS (
    SELECT tm.team_id, s.challenge_id, MAX(s.points_awarded) AS best_points
    FROM team_members tm
    JOIN solves s ON s.user_id = tm.user_id
    GROUP BY tm.team_id, s.challenge_id
  ), solve_points AS (
    SELECT team_id, COALESCE(SUM(best_points), 0) AS points
    FROM best_per_challenge
    GROUP BY team_id
  ), adjustment_points AS (
    SELECT tm.team_id, COALESCE(SUM(sa.delta), 0) AS delta
    FROM team_members tm
    JOIN score_adjustments sa ON sa.user_id = tm.user_id
    GROUP BY tm.team_id
  ), team_scores AS (
    SELECT
      t.id,
      t.name,
      t.slug,
      t.captain_id AS "captainId",
      t.invite_code AS "inviteCode",
      t.created_at AS "createdAt",
      COALESCE(sp.points, 0) + COALESCE(ap.delta, 0) AS score
    FROM teams t
    LEFT JOIN solve_points sp ON sp.team_id = t.id
    LEFT JOIN adjustment_points ap ON ap.team_id = t.id
  )
`;

/**
 * One page of ranked teams — ordered and limited inside the database so
 * only the requested page crosses the wire (same pagination contract as
 * the user leaderboard). Tied scores share a rank, ties broken by name.
 */
export async function listTeamScores(limit: number, offset: number): Promise<TeamScoreRow[]> {
  const rows = await prisma.$queryRaw<TeamScoreDbRow[]>(Prisma.sql`
    ${teamScoresCte}
    SELECT
      ts.id, ts.name, ts.slug, ts."captainId", ts."inviteCode", ts."createdAt", ts.score,
      (SELECT COUNT(*) FROM team_members m WHERE m.team_id = ts.id) AS "memberCount",
      RANK() OVER (ORDER BY ts.score DESC) AS rank
    FROM team_scores ts
    ORDER BY rank ASC, ts.name ASC, ts.id ASC
    LIMIT ${limit} OFFSET ${offset}
  `);
  return rows.map(normalizeTeamScoreRow);
}

/**
 * Exactly one team's ranked row: rank is computed as 1 + the number of
 * teams ordered strictly ahead (identical to RANK() over score DESC) —
 * the full table is never materialized.
 */
export async function teamScoreById(teamId: string): Promise<TeamScoreRow | null> {
  const rows = await prisma.$queryRaw<TeamScoreDbRow[]>(Prisma.sql`
    ${teamScoresCte}
    SELECT
      ts.id, ts.name, ts.slug, ts."captainId", ts."inviteCode", ts."createdAt", ts.score,
      (SELECT COUNT(*) FROM team_members m WHERE m.team_id = ts.id) AS "memberCount",
      1 + (SELECT COUNT(*) FROM team_scores other WHERE other.score > ts.score) AS rank
    FROM team_scores ts
    WHERE ts.id = ${teamId}
    LIMIT 1
  `);
  const row = rows[0];
  return row ? normalizeTeamScoreRow(row) : null;
}

export function generateInviteCode(): string {
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) code += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
  return code;
}

function teamSlugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'team';
}

async function uniqueTeamSlug(preferred: string): Promise<string> {
  const base = teamSlugify(preferred);
  let candidate = base;
  let suffix = 2;
  while (true) {
    const existing = await prisma.team.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing) return candidate;
    candidate = `${base.slice(0, Math.max(1, 95 - String(suffix).length))}-${suffix}`;
    suffix += 1;
  }
}

/** Pre-check + retry keeps the astronomically unlikely code collision invisible. */
async function uniqueInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateInviteCode();
    const existing = await prisma.team.findUnique({ where: { inviteCode: code }, select: { id: true } });
    if (!existing) return code;
  }
  throw new ApiError(500, 'Could not allocate an invite code. Please try again.', 'INVITE_CODE_ALLOCATION_FAILED');
}

async function listMembers(teamId: string): Promise<TeamMemberView[]> {
  const rows = await prisma.teamMember.findMany({
    where: { teamId },
    orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
    select: { userId: true, role: true, joinedAt: true, user: { select: { username: true } } },
  });
  return rows.map((row) => ({ userId: row.userId, username: row.user.username, role: row.role as TeamRole, joinedAt: row.joinedAt }));
}

/**
 * Assembles the response view for one team. `inviteCode` is only ever
 * passed by callers that already verified captaincy (i.e. /teams/mine for
 * the captain) — public team profiles and lists never carry it, so an
 * invite code cannot leak through a public read.
 */
async function buildTeamView(teamId: string, options: { inviteCode?: string } = {}): Promise<TeamView> {
  const [scored, members] = await Promise.all([teamScoreById(teamId), listMembers(teamId)]);
  if (!scored) throw new ApiError(404, 'Team not found', 'TEAM_NOT_FOUND');
  return {
    id: scored.id,
    name: scored.name,
    slug: scored.slug,
    captainId: scored.captainId,
    createdAt: scored.createdAt,
    memberCount: scored.memberCount,
    score: scored.score,
    rank: scored.rank,
    members,
    ...(options.inviteCode ? { inviteCode: options.inviteCode } : {}),
  };
}

export async function findMembership(userId: string) {
  return prisma.teamMember.findUnique({
    where: { userId },
    select: {
      userId: true,
      role: true,
      teamId: true,
      team: { select: { id: true, name: true, slug: true, inviteCode: true, captainId: true } },
    },
  });
}

/** POST /api/teams — creator becomes CAPTAIN and the first member. */
export async function createTeam(userId: string, name: string): Promise<TeamView> {
  const existing = await prisma.teamMember.findUnique({ where: { userId }, select: { teamId: true } });
  if (existing) throw new ApiError(409, 'You are already in a team.', 'ALREADY_IN_TEAM');

  const slug = await uniqueTeamSlug(name);
  const inviteCode = await uniqueInviteCode();

  let teamId: string;
  try {
    teamId = await prisma.$transaction(async (tx) => {
      const team = await tx.team.create({
        data: {
          name,
          slug,
          inviteCode,
          captainId: userId,
          // The captain is a member too — membership and captaincy are
          // written atomically so a team can never exist without one.
          members: { create: { userId, role: TeamRole.CAPTAIN } },
        },
        select: { id: true },
      });
      await createActivity(tx, {
        userId,
        type: UserActivityType.TEAM_CREATED,
        description: `Created team “${name}”.`,
        targetId: team.id,
        targetType: 'team',
        metadata: { teamSlug: slug },
      });
      return team.id;
    });
  } catch (err) {
    // Same committed-state pattern as the submission service: a P2002 here
    // means the transaction rolled back, so re-read state to decide which
    // unique constraint fired (the membership one = already in a team).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const membership = await prisma.teamMember.findUnique({ where: { userId }, select: { teamId: true } });
      if (membership) throw new ApiError(409, 'You are already in a team.', 'ALREADY_IN_TEAM');
    }
    throw err;
  }

  return buildTeamView(teamId, { inviteCode });
}

/** POST /api/teams/join — body { inviteCode }. */
export async function joinTeam(userId: string, inviteCode: string): Promise<TeamView> {
  const existing = await prisma.teamMember.findUnique({ where: { userId }, select: { teamId: true } });
  if (existing) throw new ApiError(409, 'You are already in a team.', 'ALREADY_IN_TEAM');

  const team = await prisma.team.findUnique({ where: { inviteCode }, select: { id: true, name: true, slug: true } });
  // Deliberately generic: an unknown code and an unknown team answer the
  // same way, so the endpoint cannot be used to enumerate valid codes.
  if (!team) throw new ApiError(404, 'Team not found', 'TEAM_NOT_FOUND');

  try {
    await prisma.$transaction(async (tx) => {
      // PostgreSQL needed an explicit row lock for the capacity check.
      // SQLite has no row-lock syntax; its single-writer model serializes
      // this critical section inside the transaction.
      const memberCount = await tx.teamMember.count({ where: { teamId: team.id } });
      if (memberCount >= TEAM_MEMBER_CAP) {
        throw new ApiError(409, 'That team is full.', 'TEAM_FULL');
      }
      await tx.teamMember.create({ data: { teamId: team.id, userId, role: TeamRole.MEMBER } });
      await createActivity(tx, {
        userId,
        type: UserActivityType.TEAM_JOINED,
        description: `Joined team “${team.name}”.`,
        targetId: team.id,
        targetType: 'team',
        metadata: { teamSlug: team.slug },
      });
    });
  } catch (err) {
    // Unique(userId) / unique(teamId,userId) races roll back above; report
    // them as the business error rather than a generic duplicate.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ApiError(409, 'You are already in a team.', 'ALREADY_IN_TEAM');
    }
    throw err;
  }

  return buildTeamView(team.id);
}

/**
 * POST /api/teams/leave — non-captains always leave. A captain of a team
 * that still has other members must transfer captaincy first; a solo
 * captain leaving dissolves the team entirely.
 */
export async function leaveTeam(userId: string): Promise<{ left: boolean; dissolved: boolean }> {
  const membership = await findMembership(userId);
  if (!membership) throw new ApiError(404, 'You are not in a team.', 'NOT_IN_TEAM');

  if (membership.role === TeamRole.CAPTAIN) {
    const others = await prisma.teamMember.count({
      where: { teamId: membership.teamId, userId: { not: userId } },
    });
    if (others > 0) {
      throw new ApiError(409, 'Transfer captaincy before leaving a team that still has members.', 'CAPTAIN_TRANSFER_REQUIRED');
    }
    // Solo captain: leaving dissolves the team. The membership row is
    // removed by the teams→team_members cascade — no user rows are touched.
    await prisma.team.delete({ where: { id: membership.teamId } });
    await recordActivity({
      userId,
      type: UserActivityType.TEAM_LEFT,
      description: `Left team “${membership.team.name}” (team dissolved).`,
      targetId: membership.teamId,
      targetType: 'team',
    });
    return { left: true, dissolved: true };
  }

  await prisma.teamMember.delete({ where: { userId } });
  await recordActivity({
    userId,
    type: UserActivityType.TEAM_LEFT,
    description: `Left team “${membership.team.name}”.`,
    targetId: membership.teamId,
    targetType: 'team',
  });
  return { left: true, dissolved: false };
}

/** Captain-only: remove another member from the captain's own team. */
export async function kickMember(actorId: string, targetUserId: string): Promise<{ kicked: boolean; userId: string }> {
  const actor = await findMembership(actorId);
  if (!actor) throw new ApiError(404, 'You are not in a team.', 'NOT_IN_TEAM');
  if (actor.role !== TeamRole.CAPTAIN) throw new ApiError(403, 'Only the team captain can remove members.', 'NOT_CAPTAIN');
  if (targetUserId === actorId) throw new ApiError(400, 'Captains leave instead of kicking themselves.', 'KICK_SELF');

  const target = await prisma.teamMember.findUnique({ where: { userId: targetUserId }, select: { teamId: true, role: true } });
  if (!target || target.teamId !== actor.teamId) throw new ApiError(404, 'That user is not a member of your team.', 'MEMBER_NOT_FOUND');
  // Guard captainId/team_members.role consistency: the captain must be
  // removed via a transfer (or by leaving a solo team), never by a kick.
  if (target.role === TeamRole.CAPTAIN) throw new ApiError(409, 'Transfer captaincy first.', 'CAPTAIN_TRANSFER_REQUIRED');

  await prisma.teamMember.delete({ where: { userId: targetUserId } });
  await recordActivity({
    userId: targetUserId,
    type: UserActivityType.TEAM_LEFT,
    description: `Was removed from team “${actor.team.name}” by its captain.`,
    targetId: actor.teamId,
    targetType: 'team',
  });
  return { kicked: true, userId: targetUserId };
}

/** Captain-only: rotate the invite code. Only the captain ever sees it. */
export async function regenerateInviteCode(actorId: string): Promise<{ inviteCode: string }> {
  const actor = await findMembership(actorId);
  if (!actor) throw new ApiError(404, 'You are not in a team.', 'NOT_IN_TEAM');
  if (actor.role !== TeamRole.CAPTAIN) throw new ApiError(403, 'Only the team captain can regenerate the invite code.', 'NOT_CAPTAIN');

  const inviteCode = await uniqueInviteCode();
  await prisma.team.update({ where: { id: actor.teamId }, data: { inviteCode } });
  return { inviteCode };
}

/**
 * Captain-only: dissolve the captain's own team. Distinct from /leave,
 * which requires captaincy transfer when members remain — dissolving is
 * the explicit destructive action, and logs TEAM_DISSOLVED for everyone.
 */
export async function dissolveOwnTeam(actorId: string): Promise<{ dissolved: true }> {
  const actor = await findMembership(actorId);
  if (!actor) throw new ApiError(404, 'You are not in a team.', 'NOT_IN_TEAM');
  if (actor.role !== TeamRole.CAPTAIN) throw new ApiError(403, 'Only the team captain can dissolve the team.', 'NOT_CAPTAIN');

  await dissolveTeamById(actor.teamId);
  return { dissolved: true };
}

/**
 * Shared dissolve used by the captain path and the admin override:
 * memberships first, then the team row — user rows are NEVER touched.
 */
export async function dissolveTeamById(teamId: string): Promise<void> {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, name: true } });
  if (!team) throw new ApiError(404, 'Team not found', 'TEAM_NOT_FOUND');

  const memberIds = await prisma.teamMember.findMany({ where: { teamId }, select: { userId: true } });
  await prisma.$transaction([
    prisma.teamMember.deleteMany({ where: { teamId } }),
    prisma.team.delete({ where: { id: teamId } }),
  ]);
  for (const member of memberIds) {
    await recordActivity({
      userId: member.userId,
      type: UserActivityType.TEAM_DISSOLVED,
      description: `Team “${team.name}” was dissolved.`,
      targetId: teamId,
      targetType: 'team',
    });
  }
}

/** GET /api/teams/mine */
export async function getMyTeam(userId: string): Promise<TeamView> {
  const membership = await findMembership(userId);
  if (!membership) throw new ApiError(404, 'You are not in a team.', 'NOT_IN_TEAM');
  // The invite code is only revealed to the captain; regular members manage
  // nothing about joining, so they don't need it.
  return buildTeamView(membership.teamId, membership.role === TeamRole.CAPTAIN ? { inviteCode: membership.team.inviteCode } : {});
}

/** GET /api/teams/:id — public profile, safe field selection only. */
export async function getTeamProfile(teamId: string): Promise<TeamView> {
  return buildTeamView(teamId);
}

/** GET /api/teams — paginated, sorted by score (rank order). */
export async function listTeams(query: TeamListQuery): Promise<{ teams: Array<Omit<TeamScoreRow, 'inviteCode'>>; total: number; limit: number; offset: number }> {
  const [teams, total] = await Promise.all([listTeamScores(query.limit, query.offset), prisma.team.count()]);
  return { teams: teams.map(toPublicTeamScore), total, limit: query.limit, offset: query.offset };
}

/** GET /api/teams/leaderboard — paginated, rank-ordered team scoring. */
export async function getTeamLeaderboard(query: TeamListQuery): Promise<{ leaderboard: Array<Omit<TeamScoreRow, 'inviteCode'>>; total: number; limit: number; offset: number }> {
  const [teams, total] = await Promise.all([listTeamScores(query.limit, query.offset), prisma.team.count()]);
  return { leaderboard: teams.map(toPublicTeamScore), total, limit: query.limit, offset: query.offset };
}

// ---------------------------------------------------------------------------
// Admin overrides — same mechanics as the captain actions, but performed by
// a platform ADMIN on any team (platform Role gates these; team role does
// not apply to the actor).
// ---------------------------------------------------------------------------

export async function adminListTeams(query: TeamListQuery): Promise<{ teams: Array<TeamScoreRow & { captainUsername: string | null }>; total: number; limit: number; offset: number }> {
  const [teams, total] = await Promise.all([listTeamScores(query.limit, query.offset), prisma.team.count()]);
  const captains = await prisma.user.findMany({
    where: { id: { in: teams.map((team) => team.captainId) } },
    select: { id: true, username: true },
  });
  const byId = new Map(captains.map((captain) => [captain.id, captain.username]));
  return {
    teams: teams.map((team) => ({ ...team, captainUsername: byId.get(team.captainId) ?? null })),
    total,
    limit: query.limit,
    offset: query.offset,
  };
}

/** POST /api/admin/teams/:id/transfer { userId } */
export async function adminTransferCaptain(teamId: string, targetUserId: string): Promise<TeamView> {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, name: true } });
  if (!team) throw new ApiError(404, 'Team not found', 'TEAM_NOT_FOUND');
  const target = await prisma.teamMember.findUnique({ where: { userId: targetUserId }, select: { teamId: true, role: true } });
  if (!target || target.teamId !== teamId) throw new ApiError(404, 'That user is not a member of this team.', 'MEMBER_NOT_FOUND');

  await prisma.$transaction([
    // Demote everyone first, then promote the target and point captainId at
    // them — all three writes land atomically so team.captainId and the
    // CAPTAIN membership row can never disagree.
    prisma.teamMember.updateMany({ where: { teamId }, data: { role: TeamRole.MEMBER } }),
    prisma.teamMember.update({ where: { userId: targetUserId }, data: { role: TeamRole.CAPTAIN } }),
    prisma.team.update({ where: { id: teamId }, data: { captainId: targetUserId } }),
  ]);
  return buildTeamView(teamId);
}

/** POST /api/admin/teams/:id/kick { userId } — never the captain, never user rows. */
export async function adminKickMember(teamId: string, targetUserId: string): Promise<{ kicked: boolean; userId: string }> {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, name: true, captainId: true } });
  if (!team) throw new ApiError(404, 'Team not found', 'TEAM_NOT_FOUND');
  if (team.captainId === targetUserId) {
    throw new ApiError(409, 'Transfer captaincy before removing the captain.', 'CAPTAIN_TRANSFER_REQUIRED');
  }
  const target = await prisma.teamMember.findUnique({ where: { userId: targetUserId }, select: { teamId: true } });
  if (!target || target.teamId !== teamId) throw new ApiError(404, 'That user is not a member of this team.', 'MEMBER_NOT_FOUND');

  await prisma.teamMember.delete({ where: { userId: targetUserId } });
  await recordActivity({
    userId: targetUserId,
    type: UserActivityType.TEAM_LEFT,
    description: `Was removed from team “${team.name}” by an administrator.`,
    targetId: teamId,
    targetType: 'team',
  });
  return { kicked: true, userId: targetUserId };
}
