import { Prisma } from '@prisma/client';
import { ChallengeStatus, ScoringMode, FlagMode } from '../constants/enums';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { hashFlag } from '../utils/flagHash';
import { notifyChallengePublished } from './notification.service';
import {
  AdminChallengeCreateInput,
  AdminChallengeUpdateInput,
  AdminChallengeListQuery,
  AdminCategoryCreateInput,
  AdminCategoryUpdateInput,
  AdminDifficultyCreateInput,
  AdminDifficultyUpdateInput,
} from '../validation/admin.schema';

type AdminChallengeRow = Prisma.ChallengeGetPayload<{ select: typeof adminChallengeSelect }>;

export interface AdminChallenge {
  id: string;
  slug: string;
  title: string;
  teaser: string | null;
  description: string;
  category: { id: number; name: string; slug: string };
  difficulty: { id: number; name: string; sortOrder: number };
  points: number;
  scoringMode: ScoringMode;
  status: ChallengeStatus;
  isPublished: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  archivedAt: Date | null;
  flagStored: boolean;
  caseSensitive: boolean;
  flagMode: FlagMode;
  prerequisite: { id: string; title: string } | null;
  solveCount: number;
  submissionCount: number;
  uniqueSolvers: number;
  solveRate: number;
  firstBlood: { username: string; solvedAt: Date } | null;
}

const adminChallengeSelect = {
  id: true,
  slug: true,
  title: true,
  teaser: true,
  description: true,
  points: true,
  scoringMode: true,
  status: true,
  isPublished: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  archivedAt: true,
  prerequisite: { select: { id: true, title: true } },
  category: { select: { id: true, name: true, slug: true } },
  difficulty: { select: { id: true, name: true, sortOrder: true } },
  flag: { select: { caseSensitive: true, mode: true } },
  firstBlood: { select: { solvedAt: true, user: { select: { username: true } } } },
  _count: { select: { solves: true, submissions: true } },
} satisfies Prisma.ChallengeSelect;

type ChallengeStats = { correctAttempts: number; uniqueSolvers: number };

async function getChallengeStats(challengeIds: string[]): Promise<Map<string, ChallengeStats>> {
  if (!challengeIds.length) return new Map();
  const [submissionGroups, solverGroups] = await Promise.all([
    prisma.submission.groupBy({ by: ['challengeId', 'isCorrect'], where: { challengeId: { in: challengeIds } }, _count: { _all: true } }),
    prisma.solve.groupBy({ by: ['challengeId', 'userId'], where: { challengeId: { in: challengeIds } } }),
  ]);
  const map = new Map<string, ChallengeStats>();
  for (const id of challengeIds) map.set(id, { correctAttempts: 0, uniqueSolvers: 0 });
  for (const row of submissionGroups) {
    if (row.isCorrect) map.get(row.challengeId)!.correctAttempts += row._count._all;
  }
  for (const row of solverGroups) map.get(row.challengeId)!.uniqueSolvers += 1;
  return map;
}

function toAdminChallenge(row: AdminChallengeRow, stats: ChallengeStats = { correctAttempts: 0, uniqueSolvers: 0 }): AdminChallenge {
  const solveRate = row._count.submissions ? Math.round((stats.correctAttempts / row._count.submissions) * 100) : 0;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    teaser: row.teaser,
    description: row.description,
    category: row.category,
    difficulty: row.difficulty,
    points: row.points,
    scoringMode: row.scoringMode as ScoringMode,
    status: row.status as ChallengeStatus,
    isPublished: row.isPublished,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
    archivedAt: row.archivedAt,
    flagStored: !!row.flag,
    caseSensitive: row.flag?.caseSensitive ?? true,
    flagMode: (row.flag?.mode as FlagMode | undefined) ?? FlagMode.STATIC,
    prerequisite: row.prerequisite ?? null,
    solveCount: row._count.solves,
    submissionCount: row._count.submissions,
    uniqueSolvers: stats.uniqueSolvers,
    solveRate,
    firstBlood: row.firstBlood ? { username: row.firstBlood.user.username, solvedAt: row.firstBlood.solvedAt } : null,
  };
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140) || 'challenge';
}

async function uniqueSlug(preferred: string, excludeId?: string): Promise<string> {
  const base = slugify(preferred);
  let candidate = base;
  let suffix = 2;
  while (true) {
    const existing = await prisma.challenge.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${base.slice(0, Math.max(1, 155 - String(suffix).length))}-${suffix}`;
    suffix += 1;
  }
}

async function requireCategory(id: number) {
  const category = await prisma.category.findUnique({ where: { id }, select: { id: true, name: true, slug: true } });
  if (!category) throw new ApiError(400, 'Category not found', 'CATEGORY_NOT_FOUND');
  return category;
}

async function requireDifficulty(id: number) {
  const difficulty = await prisma.difficulty.findUnique({ where: { id }, select: { id: true, name: true, sortOrder: true } });
  if (!difficulty) throw new ApiError(400, 'Difficulty not found', 'DIFFICULTY_NOT_FOUND');
  return difficulty;
}

/** Depth cap on the prerequisite chain walk — also a cheap cycle bound. */
const PREREQUISITE_MAX_DEPTH = 50;

/**
 * Validates a proposed prerequisite: it must exist, must not be the
 * challenge itself, and attaching it must not close a cycle. The chain is
 * walked from the candidate with a depth cap, so A→B→A style loops are
 * rejected without ever being written.
 */
async function validatePrerequisite(prerequisiteId: string, challengeId?: string): Promise<void> {
  if (prerequisiteId === challengeId) {
    throw new ApiError(400, 'A challenge cannot require itself.', 'PREREQUISITE_SELF');
  }
  const start = await prisma.challenge.findUnique({
    where: { id: prerequisiteId },
    select: { id: true, prerequisiteId: true },
  });
  if (!start) throw new ApiError(400, 'Prerequisite challenge not found.', 'PREREQUISITE_NOT_FOUND');

  let cursor: { id: string; prerequisiteId: string | null } = start;
  let depth = 0;
  while (cursor.prerequisiteId) {
    if (cursor.prerequisiteId === challengeId) {
      throw new ApiError(400, 'That prerequisite would create a cycle.', 'PREREQUISITE_CYCLE');
    }
    if (++depth > PREREQUISITE_MAX_DEPTH) {
      throw new ApiError(400, 'Prerequisite chain is too deep.', 'PREREQUISITE_CHAIN_TOO_DEEP');
    }
    const next: { id: string; prerequisiteId: string | null } | null = await prisma.challenge.findUnique({
      where: { id: cursor.prerequisiteId },
      select: { id: true, prerequisiteId: true },
    });
    if (!next) break; // FK integrity guarantees this in practice; stay defensive.
    cursor = next;
  }
}

export async function getAdminOverview() {
  const [totalChallenges, draftChallenges, publishedChallenges, archivedChallenges, totalSolves] = await prisma.$transaction([
    prisma.challenge.count(),
    prisma.challenge.count({ where: { status: ChallengeStatus.DRAFT } }),
    prisma.challenge.count({ where: { status: ChallengeStatus.PUBLISHED } }),
    prisma.challenge.count({ where: { status: ChallengeStatus.ARCHIVED } }),
    prisma.solve.count(),
  ]);
  return { totalChallenges, draftChallenges, publishedChallenges, archivedChallenges, totalSolves };
}

export async function listAdminChallenges(query: AdminChallengeListQuery) {
  const where: Prisma.ChallengeWhereInput = {
    ...(query.search ? { OR: [
      { title: { contains: query.search } },
      { slug: { contains: query.search } },
    ] } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.difficultyId ? { difficultyId: query.difficultyId } : {}),
    ...(query.status !== 'ALL' ? { status: query.status as ChallengeStatus } : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.challenge.findMany({ where, select: adminChallengeSelect, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: query.limit, skip: query.offset }),
    prisma.challenge.count({ where }),
  ]);
  const stats = await getChallengeStats(rows.map((row) => row.id));
  return {
    challenges: rows.map((row) => toAdminChallenge(row, stats.get(row.id))),
    total,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getAdminChallenge(id: string) {
  const row = await prisma.challenge.findUnique({ where: { id }, select: adminChallengeSelect });
  if (!row) throw new ApiError(404, 'Challenge not found', 'CHALLENGE_NOT_FOUND');
  return toAdminChallenge(row);
}

export async function createAdminChallenge(input: AdminChallengeCreateInput, adminUserId: string) {
  await Promise.all([requireCategory(input.categoryId), requireDifficulty(input.difficultyId)]);
  if (input.prerequisiteId) await validatePrerequisite(input.prerequisiteId);
  const slug = await uniqueSlug(input.slug ?? input.title);
  const published = false;
  const challenge = await prisma.challenge.create({
    data: {
      title: input.title,
      slug,
      teaser: input.teaser ?? null,
      description: input.description,
      categoryId: input.categoryId,
      difficultyId: input.difficultyId,
      points: input.points,
      scoringMode: input.scoringMode,
      prerequisiteId: input.prerequisiteId ?? null,
      status: ChallengeStatus.DRAFT,
      isPublished: published,
      publishedAt: null,
      archivedAt: null,
      createdBy: adminUserId,
      flag: { create: { flagHash: hashFlag(input.flag, input.caseSensitive), caseSensitive: input.caseSensitive, mode: input.flagMode } },
    },
    select: adminChallengeSelect,
  });
  return toAdminChallenge(challenge);
}

export async function updateAdminChallenge(id: string, input: AdminChallengeUpdateInput) {
  const existing = await prisma.challenge.findUnique({ where: { id }, select: { id: true, slug: true, flag: { select: { caseSensitive: true, mode: true } } } });
  if (!existing) throw new ApiError(404, 'Challenge not found', 'CHALLENGE_NOT_FOUND');
  if (input.categoryId !== undefined) await requireCategory(input.categoryId);
  if (input.difficultyId !== undefined) await requireDifficulty(input.difficultyId);
  if (input.prerequisiteId) await validatePrerequisite(input.prerequisiteId, id);

  const data: Prisma.ChallengeUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.slug !== undefined) data.slug = await uniqueSlug(input.slug, id);
  if (input.teaser !== undefined) data.teaser = input.teaser;
  if (input.description !== undefined) data.description = input.description;
  if (input.points !== undefined) data.points = input.points;
  if (input.scoringMode !== undefined) data.scoringMode = input.scoringMode;
  if (input.categoryId !== undefined) data.category = { connect: { id: input.categoryId } };
  if (input.difficultyId !== undefined) data.difficulty = { connect: { id: input.difficultyId } };
  if (input.prerequisiteId !== undefined) {
    data.prerequisite = input.prerequisiteId ? { connect: { id: input.prerequisiteId } } : { disconnect: true };
  }

  const flagChanged = input.flag !== undefined || input.caseSensitive !== undefined || input.flagMode !== undefined;
  if (flagChanged || Object.keys(data).length > 0) {
    // Flag row and challenge row are written atomically so a failure between
    // them can't leave the challenge with a half-updated flag.
    await prisma.$transaction(async (tx) => {
      if (flagChanged) {
        const current = await tx.flag.findUnique({ where: { challengeId: id }, select: { caseSensitive: true, mode: true } });
        const caseSensitive = input.caseSensitive ?? current?.caseSensitive ?? true;
        const mode = input.flagMode ?? current?.mode ?? FlagMode.STATIC;
        if (input.flag !== undefined) {
          await tx.flag.upsert({ where: { challengeId: id }, update: { flagHash: hashFlag(input.flag, caseSensitive), caseSensitive, mode }, create: { challengeId: id, flagHash: hashFlag(input.flag, caseSensitive), caseSensitive, mode } });
        } else if (current) {
          await tx.flag.update({ where: { challengeId: id }, data: { caseSensitive, mode } });
        }
      }
      if (Object.keys(data).length > 0) await tx.challenge.update({ where: { id }, data });
    });
  }
  return getAdminChallenge(id);
}

async function transitionChallenge(id: string, target: ChallengeStatus) {
  const existing = await prisma.challenge.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!existing) throw new ApiError(404, 'Challenge not found', 'CHALLENGE_NOT_FOUND');
  const now = new Date();

  if (target === ChallengeStatus.PUBLISHED && existing.status !== ChallengeStatus.DRAFT) {
    throw new ApiError(409, 'Only draft challenges can be published.', 'INVALID_CHALLENGE_TRANSITION');
  }
  if (target === ChallengeStatus.DRAFT && existing.status !== ChallengeStatus.PUBLISHED) {
    throw new ApiError(409, 'Only published challenges can be reverted to draft.', 'INVALID_CHALLENGE_TRANSITION');
  }
  if (target === ChallengeStatus.ARCHIVED && existing.status === ChallengeStatus.ARCHIVED) {
    throw new ApiError(409, 'Challenge is already archived.', 'INVALID_CHALLENGE_TRANSITION');
  }

  return prisma.$transaction(async (tx) => {
    // Check-then-act guard: the status must still be the one validated above.
    // updateMany with the expected status as a condition closes the race
    // where two concurrent transitions both pass the pre-check — exactly one
    // can match, the other rolls back here with a 409. Throwing inside the
    // transaction is safe: nothing is reused after the rollback.
    const guard = await tx.challenge.updateMany({
      where: { id, status: existing.status },
      data: {
        status: target,
        isPublished: target === ChallengeStatus.PUBLISHED,
        publishedAt: target === ChallengeStatus.PUBLISHED ? now : null,
        archivedAt: target === ChallengeStatus.ARCHIVED ? now : null,
      },
    });
    if (guard.count !== 1) {
      throw new ApiError(409, 'Challenge state changed concurrently — reload and try again.', 'INVALID_CHALLENGE_TRANSITION');
    }

    const updated = await tx.challenge.findUnique({ where: { id }, select: adminChallengeSelect });
    if (!updated) throw new ApiError(404, 'Challenge not found', 'CHALLENGE_NOT_FOUND');

    if (target === ChallengeStatus.PUBLISHED) {
      await notifyChallengePublished(tx, { id: updated.id, title: updated.title, publishedAt: updated.publishedAt });
    }

    return toAdminChallenge(updated);
  });
}

export async function publishAdminChallenge(id: string) { return transitionChallenge(id, ChallengeStatus.PUBLISHED); }
export async function unpublishAdminChallenge(id: string) { return transitionChallenge(id, ChallengeStatus.DRAFT); }
export async function archiveAdminChallenge(id: string) { return transitionChallenge(id, ChallengeStatus.ARCHIVED); }

export async function deleteAdminChallenge(id: string) {
  const existing = await prisma.challenge.findUnique({ where: { id }, select: { id: true, _count: { select: { solves: true, submissions: true, files: true, hints: true } }, writeup: { select: { id: true } } } });
  if (!existing) throw new ApiError(404, 'Challenge not found', 'CHALLENGE_NOT_FOUND');
  if (existing._count.solves > 0 || existing._count.submissions > 0) throw new ApiError(409, 'Challenge cannot be deleted because it has historical solves or submissions. Archive it instead.', 'CHALLENGE_HAS_HISTORY');
  if (existing._count.files > 0) throw new ApiError(409, 'Challenge cannot be deleted while challenge files exist. Delete its files first.', 'CHALLENGE_HAS_FILES');
  if (existing._count.hints > 0 || existing.writeup) throw new ApiError(409, 'Challenge has hints or a writeup. Remove those authored resources first, then delete the challenge.', 'CHALLENGE_HAS_EXTRAS');
  await prisma.challenge.delete({ where: { id } });
  return { deleted: true };
}

export async function listAdminCategories() {
  return prisma.category.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, _count: { select: { challenges: true } } } });
}
export async function createAdminCategory(input: AdminCategoryCreateInput) { return prisma.category.create({ data: input, select: { id: true, name: true, slug: true } }); }
export async function updateAdminCategory(id: number, input: AdminCategoryUpdateInput) {
  const category = await prisma.category.findUnique({ where: { id }, select: { id: true } });
  if (!category) throw new ApiError(404, 'Category not found', 'CATEGORY_NOT_FOUND');
  return prisma.category.update({ where: { id }, data: input, select: { id: true, name: true, slug: true } });
}
export async function deleteAdminCategory(id: number) {
  const category = await prisma.category.findUnique({ where: { id }, select: { id: true, _count: { select: { challenges: true } } } });
  if (!category) throw new ApiError(404, 'Category not found', 'CATEGORY_NOT_FOUND');
  if (category._count.challenges > 0) throw new ApiError(409, 'Category cannot be deleted while challenges reference it.', 'CATEGORY_HAS_CHALLENGES');
  await prisma.category.delete({ where: { id } });
  return { deleted: true };
}
export async function listAdminDifficulties() { return prisma.difficulty.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, sortOrder: true, _count: { select: { challenges: true } } } }); }
export async function createAdminDifficulty(input: AdminDifficultyCreateInput) { return prisma.difficulty.create({ data: input, select: { id: true, name: true, sortOrder: true } }); }
export async function updateAdminDifficulty(id: number, input: AdminDifficultyUpdateInput) {
  const difficulty = await prisma.difficulty.findUnique({ where: { id }, select: { id: true } });
  if (!difficulty) throw new ApiError(404, 'Difficulty not found', 'DIFFICULTY_NOT_FOUND');
  return prisma.difficulty.update({ where: { id }, data: input, select: { id: true, name: true, sortOrder: true } });
}
export async function deleteAdminDifficulty(id: number) {
  const difficulty = await prisma.difficulty.findUnique({ where: { id }, select: { id: true, _count: { select: { challenges: true } } } });
  if (!difficulty) throw new ApiError(404, 'Difficulty not found', 'DIFFICULTY_NOT_FOUND');
  if (difficulty._count.challenges > 0) throw new ApiError(409, 'Difficulty cannot be deleted while challenges reference it.', 'DIFFICULTY_HAS_CHALLENGES');
  await prisma.difficulty.delete({ where: { id } });
  return { deleted: true };
}
