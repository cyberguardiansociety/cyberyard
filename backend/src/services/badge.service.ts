import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { BadgeCreateInput, BadgeUpdateInput } from '../validation/phase8.schema';
import { awardBadgeXp } from './gamification.service';

export type BadgeCriteria =
  | { type: 'first_solve' }
  | { type: 'solved_count'; count: number }
  | { type: 'total_points'; points: number }
  | { type: 'category_solved'; categoryId: number; count: number }
  | { type: 'streak'; days: number }
  | { type: 'level'; level: number }
  | { type: 'first_blood_count'; count: number }
  | { type: 'difficulty_solved'; difficultyId: number; count: number };

/** Badge.criteria is a TEXT column on SQLite. Parse it back to the object
 *  shape callers expect, falling back to {} for null/malformed rows so a
 *  bad value can never break a read path. Exported because the
 *  gamification achievements view projects the same column. */
export function parseBadgeCriteria(value: unknown): BadgeCriteria {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return {} as BadgeCriteria;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {} as BadgeCriteria;
  return parsed as BadgeCriteria;
}

function serializeBadgeCriteria(criteria: unknown): string {
  try {
    return JSON.stringify(criteria) ?? '{}';
  } catch {
    return '{}';
  }
}

function publicBadge(row: { id: string; name: string; slug: string; description: string; icon: string; criteria: unknown; isEnabled: boolean; createdAt: Date; updatedAt: Date }) {
  return { id: row.id, name: row.name, slug: row.slug, description: row.description, icon: row.icon, criteria: parseBadgeCriteria(row.criteria), isEnabled: row.isEnabled, createdAt: row.createdAt, updatedAt: row.updatedAt };
}


export interface NewlyAwardedBadge { id: string; name: string; icon: string; }

export async function evaluateBadges(tx: Prisma.TransactionClient, userId: string): Promise<NewlyAwardedBadge[]> {
  const badges = await tx.badge.findMany({ where: { isEnabled: true }, select: { id: true, criteria: true } });
  if (!badges.length) return [];
  const [solved, points, firstBloods, gamification, solvedChallenges, alreadyAwardedRows] = await Promise.all([
    tx.solve.count({ where: { userId } }),
    tx.solve.aggregate({ where: { userId }, _sum: { pointsAwarded: true } }),
    tx.firstBlood.count({ where: { userId } }),
    tx.gamificationProfile.findUnique({ where: { userId }, select: { currentLevel: true, currentStreak: true } }),
    tx.solve.findMany({ where: { userId }, select: { challenge: { select: { categoryId: true, difficultyId: true } } } }),
    // Pre-filter already-awarded badges instead of catching P2002 from
    // userBadge.create inside this transaction: a caught unique violation
    // would abort the interactive transaction while `tx` is still in use.
    tx.userBadge.findMany({ where: { userId }, select: { badgeId: true } }),
  ]);
  const byCategory = new Map<number, number>();
  const byDifficulty = new Map<number, number>();
  for (const row of solvedChallenges) {
    byCategory.set(row.challenge.categoryId, (byCategory.get(row.challenge.categoryId) ?? 0) + 1);
    byDifficulty.set(row.challenge.difficultyId, (byDifficulty.get(row.challenge.difficultyId) ?? 0) + 1);
  }
  const awardedBadgeIds = new Set(alreadyAwardedRows.map((row) => row.badgeId));

  const newlyAwarded: NewlyAwardedBadge[] = [];
  let currentLevel = gamification?.currentLevel ?? 1;

  for (const badge of badges) {
    if (awardedBadgeIds.has(badge.id)) continue;
    const c = parseBadgeCriteria(badge.criteria);
    let qualifies = false;
    switch (c.type) {
      case 'first_solve': qualifies = solved >= 1; break;
      case 'solved_count': qualifies = solved >= c.count; break;
      case 'total_points': qualifies = (points._sum.pointsAwarded ?? 0) >= c.points; break;
      case 'category_solved': qualifies = (byCategory.get(c.categoryId) ?? 0) >= c.count; break;
      case 'streak': qualifies = (gamification?.currentStreak ?? 0) >= c.days; break;
      case 'level': qualifies = currentLevel >= c.level; break;
      case 'first_blood_count': qualifies = firstBloods >= c.count; break;
      case 'difficulty_solved': qualifies = (byDifficulty.get(c.difficultyId) ?? 0) >= c.count; break;
      default: qualifies = false;
    }
    if (!qualifies) continue;
    const created = await tx.userBadge.create({
      data: { userId, badgeId: badge.id },
      select: { badge: { select: { id: true, name: true, icon: true } } },
    });
    newlyAwarded.push(created.badge);
    // A concurrent award of the same badge can still raise P2002 here; it is
    // deliberately not caught inside the transaction — it propagates to the
    // caller (submission.service), which handles P2002 outside $transaction.
    const xpReward = await awardBadgeXp(tx, userId, created.badge.id, created.badge.name);
    if (xpReward.levelUp) currentLevel = xpReward.levelUp.to;
  }

  return newlyAwarded;
}

export async function listBadges(userId: string) {
  const rows = await prisma.badge.findMany({ where: { isEnabled: true }, orderBy: [{ name: 'asc' }], select: { id: true, name: true, slug: true, description: true, icon: true, criteria: true, isEnabled: true, createdAt: true, updatedAt: true, awards: { where: { userId }, select: { awardedAt: true }, take: 1 } } });
  return rows.map((row) => ({ ...publicBadge(row), awarded: row.awards.length > 0, awardedAt: row.awards.length ? row.awards[0].awardedAt : null }));
}

export async function getBadge(id: string, userId: string) {
  const row = await prisma.badge.findFirst({ where: { id, isEnabled: true }, select: { id: true, name: true, slug: true, description: true, icon: true, criteria: true, isEnabled: true, createdAt: true, updatedAt: true, awards: { where: { userId }, select: { awardedAt: true }, take: 1 } } });
  if (!row) throw new ApiError(404, 'Badge not found', 'BADGE_NOT_FOUND');
  return { ...publicBadge(row), awarded: row.awards.length > 0, awardedAt: row.awards.length ? row.awards[0].awardedAt : null };
}

export async function listUserBadges(userId: string) {
  const rows = await prisma.userBadge.findMany({ where: { userId, badge: { isEnabled: true } }, orderBy: { awardedAt: 'desc' }, select: { awardedAt: true, badge: { select: { id: true, name: true, slug: true, description: true, icon: true, criteria: true } } } });
  return rows.map((row) => ({ ...row.badge, criteria: parseBadgeCriteria(row.badge.criteria), awardedAt: row.awardedAt }));
}

export async function listAdminBadges() { return prisma.badge.findMany({ orderBy: [{ isEnabled: 'desc' }, { name: 'asc' }], select: { id: true, name: true, slug: true, description: true, icon: true, criteria: true, isEnabled: true, createdAt: true, updatedAt: true, _count: { select: { awards: true } } } }).then((rows) => rows.map((row) => ({ ...row, criteria: parseBadgeCriteria(row.criteria) }))); }
export async function createAdminBadge(input: BadgeCreateInput) {
  if (input.criteria.type === 'category_solved') {
    const category = await prisma.category.findUnique({ where: { id: input.criteria.categoryId }, select: { id: true } });
    if (!category) throw new ApiError(400, 'Badge category does not exist.', 'INVALID_CATEGORY');
  }
  const created = await prisma.badge.create({ data: { ...input, criteria: serializeBadgeCriteria(input.criteria) }, select: { id: true, name: true, slug: true, description: true, icon: true, criteria: true, isEnabled: true, createdAt: true, updatedAt: true } });
  return publicBadge(created);
}
export async function updateAdminBadge(id: string, input: BadgeUpdateInput) {
  if (input.criteria?.type === 'category_solved') {
    const category = await prisma.category.findUnique({ where: { id: input.criteria.categoryId }, select: { id: true } });
    if (!category) throw new ApiError(400, 'Badge category does not exist.', 'INVALID_CATEGORY');
  }
  const { criteria, ...fields } = input;
  const existing = await prisma.badge.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new ApiError(404, 'Badge not found', 'BADGE_NOT_FOUND');
  const updated = await prisma.badge.update({ where: { id }, data: { ...fields, ...(criteria ? { criteria: serializeBadgeCriteria(criteria) } : {}) }, select: { id: true, name: true, slug: true, description: true, icon: true, criteria: true, isEnabled: true, createdAt: true, updatedAt: true } });
  return publicBadge(updated);
}
export async function deleteAdminBadge(id: string) { const existing = await prisma.badge.findUnique({ where: { id }, select: { id: true, _count: { select: { awards: true } } } }); if (!existing) throw new ApiError(404, 'Badge not found', 'BADGE_NOT_FOUND'); if (existing._count.awards) throw new ApiError(409, 'Awarded badges are historical records and cannot be deleted. Disable the badge instead.', 'BADGE_HAS_AWARDS'); await prisma.badge.delete({ where: { id } }); return { deleted: true }; }
