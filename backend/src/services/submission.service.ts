import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { verifyFlag, hashSubmissionForAudit, hashFlag, deriveDynamicFlag } from '../utils/flagHash';
import { evaluateBadges } from './badge.service';
import { createActivity } from './activity.service';
import { createNotification, CreateNotificationInput } from './notification.service';
import { recordGamificationSolve } from './gamification.service';
import { computeAwardedPoints, computeBaseAward } from './scoring';
import { publishEvent, publishToUser } from '../utils/realtime';
import { ChallengeStatus, FlagMode, NotificationType, ScoringMode, UserActivityType } from '../constants/enums';

export interface SubmitFlagResult {
  correct: boolean;
  alreadySolved: boolean;
  pointsAwarded: number;
  firstBlood: boolean;
  xpAwarded?: number;
}

export interface SubmitFlagMeta { ipAddress?: string | null; }

/** Minimal projection of a committed Notification row, shaped for the
 *  SSE `notification` event and captured inside the transaction so the
 *  post-commit publish can carry the real row id. */
interface RealtimeNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  createdAt: string;
}

/**
 * A challenge can only accept submissions while PUBLISHED. Solve uniqueness
 * is enforced by the Solve composite primary key, while FirstBlood has a
 * separate unique challenge key so concurrent correct submissions cannot
 * both claim the first solve.
 */
export async function submitFlag(
  userId: string,
  challengeId: string,
  rawFlag: string,
  meta: SubmitFlagMeta
): Promise<SubmitFlagResult> {
  const challenge = await prisma.challenge.findFirst({
    where: { id: challengeId, status: ChallengeStatus.PUBLISHED },
    select: {
      title: true,
      points: true,
      scoringMode: true,
      prerequisiteId: true,
      difficulty: { select: { name: true } },
      flag: { select: { flagHash: true, caseSensitive: true, mode: true } },
    },
  });

  if (!challenge || !challenge.flag) {
    throw new ApiError(404, 'Challenge not found', 'CHALLENGE_NOT_FOUND');
  }

  // Unlock gate: a challenge with a prerequisite accepts submissions only
  // once a Solve row exists for it. Checked before anything is written so
  // a locked challenge records no submission rows at all.
  if (challenge.prerequisiteId) {
    const prerequisiteSolve = await prisma.solve.findUnique({
      where: { userId_challengeId: { userId, challengeId: challenge.prerequisiteId } },
      select: { challengeId: true },
    });
    if (!prerequisiteSolve) {
      throw new ApiError(403, 'Solve the prerequisite challenge first.', 'CHALLENGE_LOCKED');
    }
  }

  // STATIC verification is byte-for-byte the same keyed-hash comparison as
  // before. DYNAMIC additionally accepts this user's server-side derived
  // flag (re-hashed through the identical normalize→HMAC→timing-safe path),
  // so both the stored static flag and the per-user flag validate.
  let isCorrect = verifyFlag(rawFlag, challenge.flag.flagHash, challenge.flag.caseSensitive);
  if (!isCorrect && challenge.flag.mode === FlagMode.DYNAMIC) {
    const derivedFlag = deriveDynamicFlag(userId, challengeId);
    isCorrect = verifyFlag(rawFlag, hashFlag(derivedFlag, challenge.flag.caseSensitive), challenge.flag.caseSensitive);
  }
  const submittedValueHash = hashSubmissionForAudit(rawFlag);

  const runSubmissionTransaction = () => prisma.$transaction(async (tx) => {
    // Notification rows created in this transaction, captured so the
    // post-commit SSE publish below can carry their real ids.
    const createdNotifications: RealtimeNotification[] = [];
    const notify = async (input: Omit<CreateNotificationInput, 'userId'>) => {
      const created = await createNotification(tx, { userId, ...input });
      if (created) {
        createdNotifications.push({
          id: created.id,
          title: created.title,
          message: created.message,
          type: created.type as NotificationType,
          createdAt: created.createdAt.toISOString(),
        });
      }
    };

    await tx.submission.create({
      data: { userId, challengeId, submittedValueHash, isCorrect, ipAddress: meta.ipAddress ?? null },
    });

    if (!isCorrect) return { outcome: { correct: false, alreadySolved: false, pointsAwarded: 0, firstBlood: false }, notifications: createdNotifications };

    // NOTE: no unique-constraint (P2002) errors are ever caught inside this
    // callback — once a query fails the interactive transaction is aborted
    // and `tx` can no longer be used. Conflicts are handled outside, around
    // the whole $transaction call. First blood uses ON CONFLICT DO NOTHING so
    // a lost first-blood race doesn't abort the transaction either.

    // Claim first blood BEFORE computing the award: the FirstBlood insert
    // (ON CONFLICT DO NOTHING, count === 1 means we created it) is the only
    // race-free truth about first blood, and the bonus below must depend on
    // it. If the later solve.create hits P2002, the whole transaction —
    // including this claim — rolls back as before.
    // First blood is decided by the UNIQUE constraint on FirstBlood.challengeId:
    // if the row already exists, another solver won it; if it doesn't, our
    // insert below is the one that creates it. (Prisma's SQLite connector has
    // no createMany({ skipDuplicates }) — that API is PostgreSQL-only — so this
    // is a guarded insert instead. A genuine cross-connection race surfaces as
    // P2002, which the outer retry handler resolves by re-reading the committed
    // row: on retry this claim is skipped and the submission proceeds as a
    // normal solve, which is exactly the right outcome.)
    const existingFirstBlood = await tx.firstBlood.findUnique({
      where: { challengeId },
      select: { challengeId: true },
    });
    let firstBlood = false;
    if (!existingFirstBlood) {
      const claim = await tx.firstBlood.createMany({ data: [{ challengeId, userId }] });
      firstBlood = claim.count === 1;
    }

    // Points are computed AT AWARD TIME and frozen into Solve.pointsAwarded;
    // they are never recomputed afterwards (see services/scoring.ts).
    const priorSolveCount = await tx.solve.count({ where: { challengeId } });
    // SQLite stores scoring_mode as TEXT, so Prisma types it as a plain
    // string — narrow it back to the ScoringMode union here. Anything that
    // isn't the exact DYNAMIC literal falls back to STATIC (the platform
    // default), so a hand-edited or corrupt row can never crash scoring.
    const scoringMode = challenge.scoringMode === ScoringMode.DYNAMIC ? ScoringMode.DYNAMIC : ScoringMode.STATIC;
    const scoring = { points: challenge.points, scoringMode };
    const baseAward = computeBaseAward(scoring, priorSolveCount);
    const awardedPoints = computeAwardedPoints(scoring, priorSolveCount, firstBlood);

    await tx.solve.create({ data: { userId, challengeId, pointsAwarded: awardedPoints } });

    const gamification = await recordGamificationSolve(tx, {
      userId,
      challengeId,
      points: awardedPoints,
      difficulty: challenge.difficulty.name,
      solvedAt: new Date(),
      firstBlood,
    });

    if (firstBlood) {
      // Lifetime blood-points ledger, incremented atomically in the same
      // transaction as the FirstBlood claim (the profile row is guaranteed
      // to exist now — recordGamificationSolve ensures it above). The XP /
      // XpTransaction system is intentionally left untouched by this.
      await tx.gamificationProfile.update({
        where: { userId },
        data: { bloodPoints: { increment: awardedPoints - baseAward } },
      });
    }

    const newlyAwardedBadges = await evaluateBadges(tx, userId);

    await notify({
      type: NotificationType.CHALLENGE_SOLVED,
      title: 'Challenge solved',
      message: `You solved “${challenge.title}” and earned ${awardedPoints} points.`,
      link: `/challenges/${challengeId}`,
      targetId: challengeId,
      dedupeKey: `challenge-solved:${userId}:${challengeId}`,
    });
    await createActivity(tx, {
      userId,
      type: UserActivityType.CHALLENGE_SOLVED,
      description: `Solved “${challenge.title}” (+${awardedPoints} points).`,
      targetId: challengeId,
      targetType: 'challenge',
      metadata: { points: awardedPoints },
    });

    if (firstBlood) {
      await notify({
        type: NotificationType.FIRST_BLOOD,
        title: 'First Blood',
        message: `You were the first solver of “${challenge.title}”.`,
        link: `/challenges/${challengeId}`,
        targetId: challengeId,
        dedupeKey: `first-blood:${userId}:${challengeId}`,
      });
      await createActivity(tx, {
        userId,
        type: UserActivityType.FIRST_BLOOD,
        description: `Claimed First Blood on “${challenge.title}”.`,
        targetId: challengeId,
        targetType: 'challenge',
      });
    }

    for (const badge of newlyAwardedBadges) {
      await notify({
        type: NotificationType.BADGE_EARNED,
        title: 'Badge earned',
        message: `You earned the “${badge.name}” badge.`,
        link: '/badges',
        targetId: badge.id,
        dedupeKey: `badge-earned:${userId}:${badge.id}`,
      });
      await createActivity(tx, {
        userId,
        type: UserActivityType.BADGE_EARNED,
        description: `Earned the “${badge.name}” badge.`,
        targetId: badge.id,
        targetType: 'badge',
      });
    }

    return { outcome: { correct: true, alreadySolved: false, pointsAwarded: awardedPoints, firstBlood, xpAwarded: gamification.xpAwarded }, notifications: createdNotifications };
  });

  type Settled = { outcome: SubmitFlagResult; notifications: RealtimeNotification[] };
  const duplicate = (): Settled => ({ outcome: { correct: true, alreadySolved: true, pointsAwarded: 0, firstBlood: false }, notifications: [] });

  let settled: Settled;
  try {
    settled = await runSubmissionTransaction();
  } catch (err) {
    // A P2002 escaping the transaction means the transaction was aborted
    // and rolled back — `tx` must never be reused after this. Determine the
    // outcome from committed state instead: if the solve now exists, another
    // request (our own duplicate submission) won the race.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    const solved = await prisma.solve.findUnique({
      where: { userId_challengeId: { userId, challengeId } },
      select: { pointsAwarded: true },
    });
    if (solved) {
      settled = duplicate();
    } else {
      // The conflict came from a different unique constraint (e.g. a concurrent
      // badge award). Retry once — the conflicting row has committed by now, so
      // the in-transaction pre-checks will skip it on the retry.
      try {
        settled = await runSubmissionTransaction();
      } catch (retryErr) {
        if (retryErr instanceof Prisma.PrismaClientKnownRequestError && retryErr.code === 'P2002') {
          const retriedSolve = await prisma.solve.findUnique({
            where: { userId_challengeId: { userId, challengeId } },
            select: { pointsAwarded: true },
          });
          if (retriedSolve) {
            settled = duplicate();
          } else {
            throw retryErr;
          }
        } else {
          throw retryErr;
        }
      }
    }
  }

  // Post-commit realtime fan-out. These calls are fire-and-forget and
  // never throw, and they run ONLY for a solve that committed in this
  // request — duplicate/raced submissions stay silent so clients never
  // see phantom announcements. The challenge title is admin-authored
  // text; it travels as JSON (clients must escapeHtml it on render).
  const { outcome, notifications } = settled;
  if (outcome.correct && !outcome.alreadySolved) {
    publishEvent('challenge_solved', {
      challengeId,
      title: challenge.title,
      userId,
      points: outcome.pointsAwarded,
    });
    if (outcome.firstBlood) {
      publishEvent('first_blood', {
        challengeId,
        title: challenge.title,
        points: outcome.pointsAwarded,
      });
    }
    // Both scopes: the solo scoreboard and the team board refetch on the
    // matching event (no score is recomputed or sent here).
    publishEvent('leaderboard_update', { scope: 'global' });
    publishEvent('leaderboard_update', { scope: 'teams' });
    for (const notification of notifications) {
      publishToUser(userId, 'notification', notification);
    }
  }

  return outcome;
}
