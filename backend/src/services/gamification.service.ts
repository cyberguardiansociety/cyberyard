import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { ChallengeStatus, UserActivityType, XpTransactionSource } from '../constants/enums';
import { prisma } from '../utils/prisma';
import { createActivity } from './activity.service';
import { createNotification } from './notification.service';
import { parseBadgeCriteria } from './badge.service';

export const XP_FORMULA = {
  solveBase: 'challenge points + difficulty bonus',
  difficultyBonus: { Easy: 10, Medium: 20, Hard: 35, Expert: 50, Insane: 50 },
  firstBlood: 50,
  badge: 25,
};

const LEVEL_BASE = 100;
const UTC_DAY_MS = 24 * 60 * 60 * 1000;

export interface GamificationSnapshot {
  totalXp: number;
  level: number;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  progressPercentage: number;
  currentStreak: number;
  longestStreak: number;
  lastQualifyingSolveDate: Date | null;
  firstBloodCount: number;
  totalSolves: number;
  recentAchievements: Array<{ id: string; name: string; icon: string; awardedAt: Date }>;
}

export function levelThreshold(level: number): number {
  const safe = Math.max(1, Math.floor(level));
  return LEVEL_BASE * (safe - 1) * safe / 2;
}

export function calculateLevel(totalXp: number): number {
  const xp = Math.max(0, Math.floor(totalXp));
  return Math.max(1, Math.floor((Math.sqrt(1 + (8 * xp) / LEVEL_BASE) - 1) / 2) + 1);
}

export function buildProgress(totalXp: number) {
  const level = calculateLevel(totalXp);
  const currentThreshold = levelThreshold(level);
  const nextThreshold = levelThreshold(level + 1);
  const xpIntoLevel = Math.max(0, totalXp - currentThreshold);
  const span = Math.max(1, nextThreshold - currentThreshold);
  return {
    totalXp,
    level,
    xpForCurrentLevel: currentThreshold,
    xpForNextLevel: nextThreshold,
    xpIntoLevel,
    xpToNextLevel: Math.max(0, nextThreshold - totalXp),
    progressPercentage: Math.min(100, Math.round((xpIntoLevel / span) * 100)),
  };
}

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function difficultyBonus(name: string): number {
  return XP_FORMULA.difficultyBonus[name as keyof typeof XP_FORMULA.difficultyBonus] ?? 0;
}

export function calculateSolveXp(points: number, difficulty: string): number {
  return Math.max(0, Math.floor(points)) + difficultyBonus(difficulty);
}

export async function ensureGamificationProfile(db: Prisma.TransactionClient | typeof prisma, userId: string) {
  return db.gamificationProfile.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

export async function awardXp(
  tx: Prisma.TransactionClient,
  input: { userId: string; amount: number; source: XpTransactionSource; eventKey: string; targetId?: string | null },
): Promise<{ awarded: boolean; levelUp: { from: number; to: number } | null }> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) return { awarded: false, levelUp: null };
  await ensureGamificationProfile(tx, input.userId);

  // Prisma's SQLite connector does not implement createMany(skipDuplicates).
  // Use SQLite's equivalent tagged, parameterized ON CONFLICT DO NOTHING so
  // duplicate XP awards remain harmless without aborting the transaction.
  const inserted = await tx.$executeRaw`
    INSERT INTO xp_transactions
      (id, user_id, amount, source, event_key, target_id, created_at)
    VALUES
      (${randomUUID()}, ${input.userId}, ${input.amount}, ${input.source}, ${input.eventKey}, ${input.targetId ?? null}, ${new Date()})
    ON CONFLICT(event_key) DO NOTHING
  `;
  if (inserted === 0) return { awarded: false, levelUp: null };

  // Atomic read-modify-write: increment totalXp in the database instead of
  // an unlocked read-then-write that could lose concurrent XP awards.
  // SQLite's single-writer model serializes this update inside the transaction.
  const profile = await tx.gamificationProfile.update({
    where: { userId: input.userId },
    data: { totalXp: { increment: input.amount } },
    select: { totalXp: true, currentLevel: true },
  });
  const nextLevel = calculateLevel(profile.totalXp);
  let levelUp: { from: number; to: number } | null = null;
  if (nextLevel > profile.currentLevel) {
    await tx.gamificationProfile.update({ where: { userId: input.userId }, data: { currentLevel: nextLevel } });
    levelUp = { from: profile.currentLevel, to: nextLevel };
  }

  return { awarded: true, levelUp };
}

export async function updateSolveStreak(tx: Prisma.TransactionClient, userId: string, solvedAt: Date): Promise<{ currentStreak: number; longestStreak: number; milestone: number | null }> {
  await ensureGamificationProfile(tx, userId);
  // PostgreSQL needed an explicit row lock here. SQLite has no row-lock
  // syntax: its single-writer model already serializes the critical
  // read/modify/write section inside this transaction.
  const row = await tx.gamificationProfile.findUnique({
    where: { userId },
    select: { currentStreak: true, longestStreak: true, lastQualifyingSolveDate: true },
  });
  const day = utcDay(solvedAt);
  const previous = row?.lastQualifyingSolveDate ? utcDay(row.lastQualifyingSolveDate) : null;

  let current = row?.currentStreak ?? 0;
  let longest = row?.longestStreak ?? 0;
  let milestone: number | null = null;

  if (!previous) current = 1;
  else {
    const delta = day.getTime() - previous.getTime();
    if (delta === 0) return { currentStreak: current, longestStreak: longest, milestone: null };
    if (delta === UTC_DAY_MS) current += 1;
    else if (delta > UTC_DAY_MS) current = 1;
    else return { currentStreak: current, longestStreak: longest, milestone: null };
  }

  if (current > longest) longest = current;
  const milestones = [3, 5, 7, 14, 30, 60, 100];
  if (milestones.includes(current)) milestone = current;

  await tx.gamificationProfile.update({
    where: { userId },
    data: { currentStreak: current, longestStreak: longest, lastQualifyingSolveDate: day },
  });
  return { currentStreak: current, longestStreak: longest, milestone };
}

export async function recordGamificationSolve(tx: Prisma.TransactionClient, input: { userId: string; challengeId: string; points: number; difficulty: string; solvedAt: Date; firstBlood: boolean }) {
  const xp = calculateSolveXp(input.points, input.difficulty);
  const solveReward = await awardXp(tx, {
    userId: input.userId,
    amount: xp,
    source: XpTransactionSource.CHALLENGE_SOLVE,
    eventKey: `solve:${input.userId}:${input.challengeId}`,
    targetId: input.challengeId,
  });
  const firstBloodReward = input.firstBlood ? await awardXp(tx, {
    userId: input.userId,
    amount: XP_FORMULA.firstBlood,
    source: XpTransactionSource.FIRST_BLOOD,
    eventKey: `first-blood:${input.userId}:${input.challengeId}`,
    targetId: input.challengeId,
  }) : { awarded: false, levelUp: null };
  const streak = await updateSolveStreak(tx, input.userId, input.solvedAt);

  const levelUp = [solveReward.levelUp, firstBloodReward.levelUp].find(Boolean) ?? null;
  if (levelUp) {
    await createNotification(tx, {
      userId: input.userId,
      type: 'SYSTEM',
      title: `Level ${levelUp.to} reached`,
      message: `You reached level ${levelUp.to} with ${xp + (firstBloodReward.awarded ? XP_FORMULA.firstBlood : 0)} XP earned from this solve.`,
      link: '/profile',
      dedupeKey: `level-up:${input.userId}:${levelUp.to}`,
    });
    await createActivity(tx, {
      userId: input.userId,
      type: UserActivityType.LEVEL_UP,
      description: `Reached level ${levelUp.to}.`,
      metadata: { level: levelUp.to },
    });
  }
  if (streak.milestone) {
    await createNotification(tx, {
      userId: input.userId,
      type: 'SYSTEM',
      title: `${streak.milestone}-day streak`,
      message: `You reached a ${streak.milestone}-day solving streak.`,
      link: '/profile',
      dedupeKey: `streak-milestone:${input.userId}:${streak.milestone}`,
    });
    await createActivity(tx, {
      userId: input.userId,
      type: UserActivityType.STREAK_MILESTONE,
      description: `Reached a ${streak.milestone}-day solving streak.`,
      metadata: { days: streak.milestone },
    });
  }

  return { xpAwarded: (solveReward.awarded ? xp : 0) + (firstBloodReward.awarded ? XP_FORMULA.firstBlood : 0), levelUp, streak };
}

export async function awardBadgeXp(tx: Prisma.TransactionClient, userId: string, badgeId: string, badgeName: string) {
  const reward = await awardXp(tx, {
    userId,
    amount: XP_FORMULA.badge,
    source: XpTransactionSource.BADGE_EARNED,
    eventKey: `badge:${userId}:${badgeId}`,
    targetId: badgeId,
  });
  if (reward.levelUp) {
    await createNotification(tx, {
      userId,
      type: 'SYSTEM',
      title: `Level ${reward.levelUp.to} reached`,
      message: `Your “${badgeName}” achievement pushed you to level ${reward.levelUp.to}.`,
      link: '/profile',
      dedupeKey: `level-up:${userId}:${reward.levelUp.to}`,
    });
    await createActivity(tx, {
      userId,
      type: UserActivityType.LEVEL_UP,
      description: `Reached level ${reward.levelUp.to}.`,
      metadata: { level: reward.levelUp.to },
    });
  }
  return reward;
}

export async function getGamificationSnapshot(userId: string): Promise<GamificationSnapshot> {
  const profile = await ensureGamificationProfile(prisma, userId);
  const [firstBloodCount, totalSolves, recentAchievements] = await Promise.all([
    prisma.firstBlood.count({ where: { userId } }),
    prisma.solve.count({ where: { userId } }),
    prisma.userBadge.findMany({ where: { userId, badge: { isEnabled: true } }, orderBy: { awardedAt: 'desc' }, take: 6, select: { awardedAt: true, badge: { select: { id: true, name: true, icon: true } } } }),
  ]);
  return {
    ...buildProgress(profile.totalXp),
    currentStreak: profile.currentStreak,
    longestStreak: profile.longestStreak,
    lastQualifyingSolveDate: profile.lastQualifyingSolveDate,
    firstBloodCount,
    totalSolves,
    recentAchievements: recentAchievements.map(row => ({ ...row.badge, awardedAt: row.awardedAt })),
  };
}

export async function getCategoryProgress(userId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: number | bigint; name: string; solved: number | bigint; available: number | bigint }>>`
    SELECT c.id, c.name,
      COUNT(DISTINCT CASE WHEN s.user_id = ${userId} THEN ch.id END) AS solved,
      COUNT(DISTINCT ch.id) AS available
    FROM categories c
    LEFT JOIN challenges ch ON ch.category_id = c.id AND ch.status = ${ChallengeStatus.PUBLISHED}
    LEFT JOIN solves s ON s.challenge_id = ch.id AND s.user_id = ${userId}
    GROUP BY c.id, c.name
    ORDER BY c.id ASC
  `;
  return rows.map((row) => {
    const solved = Number(row.solved);
    const available = Number(row.available);
    return { id: Number(row.id), name: row.name, solved, available, percentage: available ? Math.round((solved / available) * 100) : 0 };
  });
}

export async function getDifficultyProgress(userId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: number | bigint; name: string; solved: number | bigint; available: number | bigint }>>`
    SELECT d.id, d.name,
      COUNT(DISTINCT CASE WHEN s.user_id = ${userId} THEN ch.id END) AS solved,
      COUNT(DISTINCT ch.id) AS available
    FROM difficulties d
    LEFT JOIN challenges ch ON ch.difficulty_id = d.id AND ch.status = ${ChallengeStatus.PUBLISHED}
    LEFT JOIN solves s ON s.challenge_id = ch.id AND s.user_id = ${userId}
    GROUP BY d.id, d.name, d.sort_order
    ORDER BY d.sort_order ASC, d.id ASC
  `;
  return rows.map((row) => {
    const solved = Number(row.solved);
    const available = Number(row.available);
    return { id: Number(row.id), name: row.name, solved, available, percentage: available ? Math.round((solved / available) * 100) : 0 };
  });
}

export async function getGamificationProgress(userId: string) {
  const [me, categories, difficulties] = await Promise.all([getGamificationSnapshot(userId), getCategoryProgress(userId), getDifficultyProgress(userId)]);
  return { ...me, categories, difficulties };
}

export async function listGamificationAchievements(userId: string) {
  return prisma.badge.findMany({
    where: { isEnabled: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      icon: true,
      criteria: true,
      awards: { where: { userId }, select: { awardedAt: true }, take: 1 },
    },
  }).then(rows => rows.map(row => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    // criteria is TEXT on SQLite — return the object shape, never the raw
    // JSON string (the client renders these rules).
    criteria: parseBadgeCriteria(row.criteria),
    awarded: row.awards.length > 0,
    awardedAt: row.awards[0]?.awardedAt ?? null,
  })));
}
