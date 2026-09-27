import { Prisma } from '@prisma/client';
import { ChallengeStatus, ScoringMode, FlagMode } from '../constants/enums';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { deriveDynamicFlag } from '../utils/flagHash';
import { ListChallengesQuery } from '../validation/challenges.schema';

export interface PublicChallengeSummary {
  id: string;
  slug: string;
  title: string;
  category: { id: number; name: string };
  difficulty: { id: number; name: string };
  points: number;
  teaser: string | null;
  status: ChallengeStatus;
  solved: boolean;
  solveCount: number;
}

export interface ChallengeStatistics {
  totalSolves: number;
  totalAttempts: number;
  uniqueSolvers: number;
  solveRate: number;
  firstBlood: { username: string; solvedAt: Date } | null;
}

export interface ChallengePrerequisiteInfo {
  id: string;
  title: string;
  points: number;
}

export interface PublicChallengeDetail extends PublicChallengeSummary {
  description: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  archivedAt: Date | null;
  statistics: ChallengeStatistics;
  scoringMode: ScoringMode;
  /** True while the prerequisite solve is missing; submissions then 403. */
  locked: boolean;
  /** The unlock gate, present whenever one is configured (even if unlocked). */
  prerequisite: ChallengePrerequisiteInfo | null;
  /**
   * Only present for FlagMode.DYNAMIC challenges the caller may currently
   * access: the requesting user's own derived flag, so the frontend can
   * render "Your flag". Static challenges never include any flag material
   * (the stored flagHash never leaves the server), and a locked challenge
   * never includes a derived one either.
   */
  dynamicFlag?: string;
}

const publicChallengeSelect = {
  id: true,
  slug: true,
  title: true,
  points: true,
  teaser: true,
  status: true,
  category: { select: { id: true, name: true } },
  difficulty: { select: { id: true, name: true } },
  _count: { select: { solves: true } },
} satisfies Prisma.ChallengeSelect;

type PublicChallengeRow = Prisma.ChallengeGetPayload<{ select: typeof publicChallengeSelect }>;

function toSummary(row: PublicChallengeRow, solved: boolean): PublicChallengeSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    difficulty: row.difficulty,
    points: row.points,
    teaser: row.teaser,
    status: row.status as ChallengeStatus,
    solved,
    solveCount: row._count.solves,
  };
}

function buildSort(orderBy: ListChallengesQuery['sort']): Prisma.ChallengeOrderByWithRelationInput[] {
  switch (orderBy) {
    case 'oldest': return [{ createdAt: 'asc' }, { id: 'asc' }];
    case 'points_desc': return [{ points: 'desc' }, { title: 'asc' }, { id: 'asc' }];
    case 'points_asc': return [{ points: 'asc' }, { title: 'asc' }, { id: 'asc' }];
    case 'solves_desc': return [{ solves: { _count: 'desc' } }, { title: 'asc' }, { id: 'asc' }];
    case 'title_asc': return [{ title: 'asc' }, { id: 'asc' }];
    case 'newest':
    default: return [{ createdAt: 'desc' }, { id: 'asc' }];
  }
}

/**
 * Lists only published challenges. Filtering, sorting, and pagination are
 * performed by PostgreSQL; the browser never receives the full challenge set.
 */
export async function listChallenges(
  query: ListChallengesQuery,
  currentUserId: string
): Promise<{ challenges: PublicChallengeSummary[]; total: number; solvedTotal: number; limit: number; offset: number }> {
  const solvedFilter = query.solved;
  const where: Prisma.ChallengeWhereInput = {
    status: ChallengeStatus.PUBLISHED,
    ...(query.search ? { title: { contains: query.search } } : {}),
    ...(query.category ? { category: { is: { name: { equals: query.category } } } } : {}),
    ...(query.difficulty ? { difficulty: { is: { name: { equals: query.difficulty } } } } : {}),
    ...(solvedFilter === 'solved' ? { solves: { some: { userId: currentUserId } } } : {}),
    ...(solvedFilter === 'unsolved' ? { solves: { none: { userId: currentUserId } } } : {}),
  };

  const [challenges, total, solvedTotal] = await prisma.$transaction([
    prisma.challenge.findMany({
      where,
      select: publicChallengeSelect,
      orderBy: buildSort(query.sort),
      take: query.limit,
      skip: query.offset,
    }),
    prisma.challenge.count({ where }),
    prisma.solve.count({ where: { userId: currentUserId, challenge: { status: ChallengeStatus.PUBLISHED } } }),
  ]);

  const solvedIds = await solvedChallengeIdSet(currentUserId, challenges.map((c) => c.id));
  return {
    challenges: challenges.map((c) => toSummary(c, solvedIds.has(c.id))),
    total,
    solvedTotal,
    limit: query.limit,
    offset: query.offset,
  };
}

/**
 * Published challenges are visible to all authenticated users. An archived
 * challenge remains directly viewable only to a user who already solved it,
 * preserving their historical access without reopening submissions.
 */
export async function getChallengeById(id: string, currentUserId: string): Promise<PublicChallengeDetail> {
  const challenge = await prisma.challenge.findUnique({
    where: { id },
    select: {
      ...publicChallengeSelect,
      description: true,
      createdAt: true,
      updatedAt: true,
      publishedAt: true,
      archivedAt: true,
      scoringMode: true,
      flag: { select: { mode: true } },
      // The prerequisite is fetched together with its solve state for this
      // caller in one query, so lock evaluation needs no extra round trip.
      prerequisite: {
        select: {
          id: true,
          title: true,
          points: true,
          solves: { where: { userId: currentUserId }, select: { challengeId: true }, take: 1 },
        },
      },
      solves: { where: { userId: currentUserId }, select: { userId: true }, take: 1 },
      _count: { select: { solves: true, submissions: true } },
      firstBlood: { select: { solvedAt: true, user: { select: { username: true } } } },
    },
  });

  if (!challenge) throw new ApiError(404, 'Challenge not found', 'CHALLENGE_NOT_FOUND');

  const solved = challenge.solves.length > 0;
  if (challenge.status !== ChallengeStatus.PUBLISHED && !(challenge.status === ChallengeStatus.ARCHIVED && solved)) {
    throw new ApiError(404, 'Challenge not found', 'CHALLENGE_NOT_FOUND');
  }

  // A challenge stays unlocked for users who already solved it even if an
  // administrator attaches a prerequisite afterwards — history wins.
  const prerequisite: ChallengePrerequisiteInfo | null = challenge.prerequisite
    ? { id: challenge.prerequisite.id, title: challenge.prerequisite.title, points: challenge.prerequisite.points }
    : null;
  const locked = !!challenge.prerequisite && challenge.prerequisite.solves.length === 0 && !solved;

  const [correctAttempts, uniqueSolverRows] = await Promise.all([
    prisma.submission.count({ where: { challengeId: id, isCorrect: true } }),
    prisma.solve.groupBy({ by: ['userId'], where: { challengeId: id } }),
  ]);
  const totalAttempts = challenge._count.submissions;

  return {
    ...toSummary(challenge, solved),
    description: challenge.description,
    createdAt: challenge.createdAt,
    updatedAt: challenge.updatedAt,
    publishedAt: challenge.publishedAt,
    archivedAt: challenge.archivedAt,
    scoringMode: challenge.scoringMode as ScoringMode,
    locked,
    prerequisite,
    // Derive only for the requesting user, only when accessible — locked
    // challenges hand out no flag material at all.
    ...(challenge.flag?.mode === FlagMode.DYNAMIC && !locked
      ? { dynamicFlag: deriveDynamicFlag(currentUserId, id) }
      : {}),
    statistics: {
      totalSolves: challenge._count.solves,
      totalAttempts,
      uniqueSolvers: uniqueSolverRows.length,
      solveRate: totalAttempts ? Math.round((correctAttempts / totalAttempts) * 100) : 0,
      firstBlood: challenge.firstBlood
        ? { username: challenge.firstBlood.user.username, solvedAt: challenge.firstBlood.solvedAt }
        : null,
    },
  };
}

async function solvedChallengeIdSet(userId: string, challengeIds: string[]): Promise<Set<string>> {
  if (challengeIds.length === 0) return new Set();
  const solves = await prisma.solve.findMany({
    where: { userId, challengeId: { in: challengeIds } },
    select: { challengeId: true },
  });
  return new Set(solves.map((s) => s.challengeId));
}
