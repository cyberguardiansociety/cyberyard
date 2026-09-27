import { Prisma } from '@prisma/client';
import { ChallengeStatus } from '../constants/enums';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';

export interface LeaderboardEntry {
  id: string;
  username: string;
  points: number;
  solved: number;
  rank: number;
  online: boolean;
  xp: number;
  level: number;
  firstBloods: number;
  currentStreak: number;
}

export interface RecentSolve {
  challengeId: string;
  title: string;
  category: string;
  points: number;
  solvedAt: Date;
}

export interface CategoryStat {
  id: number;
  name: string;
  solved: number;
  total: number;
  percentage: number;
}

export interface UserStats {
  userId: string;
  username: string;
  points: number;
  solved: number;
  rank: number;
  totalSubmissions: number;
  correctSubmissions: number;
  solveRate: number;
  currentStreak: number;
  recentSolves: RecentSolve[];
  categories: CategoryStat[];
  xp: number;
  level: number;
  firstBloods: number;
  longestStreak: number;
}

type LeaderboardNumericValue = number | bigint;

type LeaderboardDbRow = {
  id: string;
  username: string;
  points: LeaderboardNumericValue;
  solved: LeaderboardNumericValue;
  rank: LeaderboardNumericValue;
  xp: LeaderboardNumericValue;
  level: LeaderboardNumericValue;
  firstBloods: LeaderboardNumericValue;
  currentStreak: LeaderboardNumericValue;
};

type LeaderboardRow = {
  id: string;
  username: string;
  points: number;
  solved: number;
  rank: number;
  xp: number;
  level: number;
  firstBloods: number;
  currentStreak: number;
};

function normalizeLeaderboardRow(row: LeaderboardDbRow): LeaderboardRow {
  return {
    id: row.id,
    username: row.username,
    points: Number(row.points),
    solved: Number(row.solved),
    rank: Number(row.rank),
    xp: Number(row.xp),
    level: Number(row.level),
    firstBloods: Number(row.firstBloods),
    currentStreak: Number(row.currentStreak),
  };
}

/**
 * Scores are derived from Solve.pointsAwarded plus any admin
 * ScoreAdjustment deltas for the user — there is no separate/manual score
 * column on the user to keep in sync with the solve history, and
 * adjustments are additive rows that never rewrite past solves. Users with
 * no solves remain rankable at the bottom of the table.
 *
 * The aggregation CTE is shared by both queries below via Prisma.sql (values
 * interpolated into Prisma.sql are bound parameters; embedded Sql fragments
 * are composed, never string-concatenated).
 */
const scoredCte = Prisma.sql`
    WITH solve_totals AS (
      SELECT user_id, COALESCE(SUM(points_awarded), 0) AS points, COUNT(challenge_id) AS solved
      FROM solves
      GROUP BY user_id
    ), adjustment_totals AS (
      SELECT user_id, COALESCE(SUM(delta), 0) AS delta
      FROM score_adjustments
      GROUP BY user_id
    ), first_blood_totals AS (
      SELECT user_id, COUNT(*) AS first_bloods
      FROM first_bloods
      GROUP BY user_id
    ), scored AS (
      SELECT
        u.id,
        u.username,
        COALESCE(st.points, 0) + COALESCE(adj.delta, 0) AS points,
        COALESCE(st.solved, 0) AS solved,
        COALESCE(gp.total_xp, 0) AS xp,
        COALESCE(gp.current_level, 1) AS level,
        COALESCE(fbt.first_bloods, 0) AS first_bloods,
        COALESCE(gp.current_streak, 0) AS current_streak
      FROM users u
      LEFT JOIN solve_totals st ON st.user_id = u.id
      LEFT JOIN adjustment_totals adj ON adj.user_id = u.id
      LEFT JOIN gamification_profiles gp ON gp.user_id = u.id
      LEFT JOIN first_blood_totals fbt ON fbt.user_id = u.id
    )
`;

/**
 * Ranking is ordered and limited inside the database so only the requested
 * page crosses the wire — the full ranked table is never materialized per
 * request. Response shape (including rank values and tie-breaking) is
 * unchanged from the previous in-memory slice.
 */
async function rankedUsers(limit: number, offset: number): Promise<LeaderboardRow[]> {
  const rows = await prisma.$queryRaw<LeaderboardDbRow[]>(Prisma.sql`
    ${scoredCte}
    SELECT
      id, username, points, solved, xp, level,
      first_bloods AS "firstBloods",
      current_streak AS "currentStreak",
      RANK() OVER (ORDER BY points DESC, solved DESC) AS rank
    FROM scored
    ORDER BY rank ASC, username ASC
    LIMIT ${limit} OFFSET ${offset}
  `);
  return rows.map(normalizeLeaderboardRow);
}

/**
 * Returns exactly one user's ranked row without materializing the table:
 * the rank is computed in SQL as 1 + the number of users ordered strictly
 * ahead of this one (identical to RANK() over points DESC, solved DESC).
 */
async function rankedUserById(userId: string): Promise<LeaderboardRow | null> {
  const rows = await prisma.$queryRaw<LeaderboardDbRow[]>(Prisma.sql`
    ${scoredCte}
    SELECT
      s.id, s.username, s.points, s.solved, s.xp, s.level,
      s.first_bloods AS "firstBloods",
      s.current_streak AS "currentStreak",
      1 + (
        SELECT COUNT(*) FROM scored better
        WHERE better.points > s.points
           OR (better.points = s.points AND better.solved > s.solved)
      ) AS rank
    FROM scored s
    WHERE s.id = ${userId}
    LIMIT 1
  `);
  const row = rows[0];
  return row ? normalizeLeaderboardRow(row) : null;
}

export async function getLeaderboard(limit = 50, offset = 0): Promise<LeaderboardEntry[]> {
  const rows = await rankedUsers(limit, offset);
  return rows.map((row) => ({
    ...row,
    // The current schema has no presence/online-session model. Do not
    // pretend that lastLoginAt is real-time presence.
    online: false,
  }));
}

export async function getUserRankedStats(userId: string): Promise<LeaderboardRow> {
  const row = await rankedUserById(userId);
  if (!row) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  return row;
}

export async function getUserStats(userId: string): Promise<UserStats> {
  const [ranked, user, submissions, recentSolves, categories, gamification] = await Promise.all([
    getUserRankedStats(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true } }),
    prisma.submission.aggregate({
      where: { userId },
      _count: { _all: true },
    }),
    prisma.solve.findMany({
      where: { userId, challenge: { status: ChallengeStatus.PUBLISHED } },
      orderBy: { solvedAt: 'desc' },
      take: 10,
      select: {
        challengeId: true,
        solvedAt: true,
        pointsAwarded: true,
        challenge: {
          select: {
            title: true,
            category: { select: { name: true } },
          },
        },
      },
    }),
    prisma.category.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        challenges: {
          where: { status: ChallengeStatus.PUBLISHED },
          select: { id: true },
        },
      },
    }),
    prisma.gamificationProfile.upsert({ where: { userId }, update: {}, create: { userId } }),
  ]);

  if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');

  const correctSubmissions = await prisma.submission.count({ where: { userId, isCorrect: true } });
  const solveRate = submissions._count._all
    ? Math.round((correctSubmissions / submissions._count._all) * 100)
    : 0;

  const solvedRows = await prisma.solve.findMany({
    where: { userId },
    select: { challengeId: true },
  });
  const solvedIds = new Set(solvedRows.map((solve) => solve.challengeId));

  const categoryStats = categories.map((category) => {
    const total = category.challenges.length;
    const solved = category.challenges.reduce(
      (count, challenge) => count + (solvedIds.has(challenge.id) ? 1 : 0),
      0
    );
    return {
      id: category.id,
      name: category.name,
      solved,
      total,
      percentage: total ? Math.round((solved / total) * 100) : 0,
    };
  });

  return {
    userId: user.id,
    username: user.username,
    points: ranked.points,
    solved: ranked.solved,
    rank: ranked.rank,
    totalSubmissions: submissions._count._all,
    correctSubmissions,
    solveRate,
    currentStreak: gamification.currentStreak,
    recentSolves: recentSolves.map((solve) => ({
      challengeId: solve.challengeId,
      title: solve.challenge.title,
      category: solve.challenge.category.name,
      points: solve.pointsAwarded,
      solvedAt: solve.solvedAt,
    })),
    categories: categoryStats,
    xp: gamification.totalXp,
    level: gamification.currentLevel,
    firstBloods: ranked.firstBloods,
    longestStreak: gamification.longestStreak,
  };
}

