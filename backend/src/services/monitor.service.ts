import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { ScoreAdjustInput, SubmissionMonitorQuery, FirstBloodListQuery } from '../validation/monitor.schema';

/**
 * Admin monitoring + scoring-correction services. Everything is paginated
 * in the database (take/skip + count) so a large submissions table never
 * crosses the wire whole.
 */

export interface SubmissionMonitorRow {
  id: string;
  user: { id: string; username: string };
  challenge: { id: string; title: string };
  correct: boolean;
  createdAt: Date;
}

/** GET /api/admin/submissions — did not previously exist anywhere (checked:
 * no admin route listed submissions; this is the first monitor surface). */
export async function listSubmissions(query: SubmissionMonitorQuery): Promise<{ submissions: SubmissionMonitorRow[]; total: number; limit: number; offset: number }> {
  const where = {
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.challengeId ? { challengeId: query.challengeId } : {}),
    ...(query.correct === 'correct' ? { isCorrect: true } : query.correct === 'incorrect' ? { isCorrect: false } : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.submission.findMany({
      where,
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
      skip: query.offset,
      select: {
        id: true,
        isCorrect: true,
        submittedAt: true,
        user: { select: { id: true, username: true } },
        challenge: { select: { id: true, title: true } },
      },
    }),
    prisma.submission.count({ where }),
  ]);

  return {
    submissions: rows.map((row) => ({
      id: row.id,
      user: row.user,
      challenge: row.challenge,
      correct: row.isCorrect,
      createdAt: row.submittedAt,
    })),
    total,
    limit: query.limit,
    offset: query.offset,
  };
}

export interface FirstBloodRow {
  challengeId: string;
  challengeTitle: string;
  userId: string;
  username: string;
  solvedAt: Date;
}

/** GET /api/admin/first-bloods — paginated. */
export async function listFirstBloods(query: FirstBloodListQuery): Promise<{ firstBloods: FirstBloodRow[]; total: number; limit: number; offset: number }> {
  const where = query.challengeId ? { challengeId: query.challengeId } : {};
  const [rows, total] = await prisma.$transaction([
    prisma.firstBlood.findMany({
      where,
      orderBy: [{ solvedAt: 'desc' }, { challengeId: 'asc' }],
      take: query.limit,
      skip: query.offset,
      select: {
        challengeId: true,
        solvedAt: true,
        challenge: { select: { title: true } },
        user: { select: { id: true, username: true } },
      },
    }),
    prisma.firstBlood.count({ where }),
  ]);

  return {
    firstBloods: rows.map((row) => ({
      challengeId: row.challengeId,
      challengeTitle: row.challenge.title,
      userId: row.user.id,
      username: row.user.username,
      solvedAt: row.solvedAt,
    })),
    total,
    limit: query.limit,
    offset: query.offset,
  };
}

export interface ScoreAdjustmentView {
  id: string;
  userId: string;
  delta: number;
  reason: string;
  adminId: string;
  createdAt: Date;
}

/**
 * POST /api/admin/scores/adjust — appends an adjustment row (|delta| ≤
 * 10000, enforced by zod). Solve history is never rewritten; the value
 * flows into the user's and their team's scores via the additive
 * SUM(delta) in the leaderboard/team SQL.
 */
export async function createScoreAdjustment(adminId: string, input: ScoreAdjustInput): Promise<ScoreAdjustmentView> {
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
  if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');

  return prisma.scoreAdjustment.create({
    data: { userId: input.userId, delta: input.delta, reason: input.reason, adminId },
    select: { id: true, userId: true, delta: true, reason: true, adminId: true, createdAt: true },
  });
}

/**
 * POST /api/admin/challenges/:id/reset-solves — wipes ONE challenge's
 * solves so leaderboards re-derive fresh (e.g. after a scoring change).
 * deleteMany only, scoped to that challengeId, in a single transaction —
 * never raw SQL, never TRUNCATE, never rows of any other challenge. A
 * full-platform reset is a deliberate operator action against the local
 * PostgreSQL database (see DEPLOYMENT.md), NOT exposed as an endpoint.
 */
export async function resetChallengeSolves(challengeId: string): Promise<{ reset: true; deleted: { submissions: number; solves: number; firstBloods: number } }> {
  const challenge = await prisma.challenge.findUnique({ where: { id: challengeId }, select: { id: true } });
  if (!challenge) throw new ApiError(404, 'Challenge not found', 'CHALLENGE_NOT_FOUND');

  const [submissions, solves, firstBloods] = await prisma.$transaction([
    prisma.submission.deleteMany({ where: { challengeId } }),
    prisma.solve.deleteMany({ where: { challengeId } }),
    prisma.firstBlood.deleteMany({ where: { challengeId } }),
  ]);

  return {
    reset: true,
    deleted: {
      submissions: submissions.count,
      solves: solves.count,
      firstBloods: firstBloods.count,
    },
  };
}
