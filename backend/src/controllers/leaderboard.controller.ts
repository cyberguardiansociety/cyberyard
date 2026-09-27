import { Request, Response } from 'express';
import { getLeaderboard, getUserStats } from '../services/leaderboard.service';
import { ApiError } from '../utils/ApiError';
import { userIdParamSchema } from '../validation/community.schema';

function parsePositiveInt(value: unknown, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) {
    throw new ApiError(400, 'Invalid pagination parameter', 'INVALID_PAGINATION');
  }
  return parsed;
}

/** GET /api/leaderboard */
export async function getLeaderboardController(req: Request, res: Response): Promise<void> {
  const limit = parsePositiveInt(req.query.limit, 50, 100);
  const offset = parsePositiveInt(req.query.offset, 0, 10000);
  const leaderboard = await getLeaderboard(limit, offset);
  res.status(200).json({ leaderboard });
}

/** GET /api/users/me/stats */
export async function getMyStats(req: Request, res: Response): Promise<void> {
  const stats = await getUserStats(req.user!.id);
  res.status(200).json({ stats });
}

/** GET /api/users/:id/stats — public leaderboard-safe statistics only. */
export async function getUserStatsById(req: Request, res: Response): Promise<void> {
  // Validate the UUID before it reaches Prisma/raw SQL — otherwise a
  // non-UUID id surfaces as a 500 instead of a client error.
  const { id } = userIdParamSchema.parse(req.params);
  const stats = await getUserStats(id);
  res.status(200).json({
    stats: {
      userId: stats.userId,
      username: stats.username,
      points: stats.points,
      solved: stats.solved,
      rank: stats.rank,
      xp: stats.xp,
      level: stats.level,
      firstBloods: stats.firstBloods,
      currentStreak: stats.currentStreak,
      longestStreak: stats.longestStreak,
      categories: stats.categories,
      recentSolves: stats.recentSolves,
    },
  });
}
