import { ScoringMode } from '../constants/enums';

/**
 * Pure scoring helpers — no I/O, no Prisma. Every function here is called
 * at AWARD TIME only: the computed value is written once into
 * Solve.pointsAwarded (and never recomputed afterwards), so changing a
 * challenge's point value or these constants later never rewrites history.
 */

/** Decay constant for dynamic scoring. Higher = slower decay. */
export const DYNAMIC_DECAY_K = 15;

/** Dynamic awards never drop below this fraction of the base points. */
export const DYNAMIC_FLOOR_RATIO = 0.4;

/** First-blood bonus: this fraction of base points, but never below 10. */
export const FIRST_BLOOD_BONUS_RATIO = 0.25;
export const FIRST_BLOOD_MIN_BONUS = 10;

/** The subset of a Challenge row the scoring helpers need. */
export interface ScorableChallenge {
  points: number;
  scoringMode: ScoringMode;
}

/**
 * Base award for one solve, before the first-blood bonus.
 *
 * STATIC — the configured points, exactly as before.
 * DYNAMIC — exponential decay keyed on how many solves already exist when
 * this solve is awarded ("solves after this one" in the finished table for
 * all but the latest solver): round(base * exp(-priorSolves / K)), clamped
 * to [ceil(base * FLOOR_RATIO), base]. The first solver always earns full
 * points; the value can never fall below the floor.
 */
export function computeBaseAward(challenge: ScorableChallenge, priorSolveCount: number): number {
  const base = Math.max(0, Math.floor(challenge.points));
  if (challenge.scoringMode !== ScoringMode.DYNAMIC) return base;

  const decayed = Math.round(base * Math.exp(-Math.max(0, priorSolveCount) / DYNAMIC_DECAY_K));
  const floor = Math.ceil(base * DYNAMIC_FLOOR_RATIO);
  return Math.min(base, Math.max(floor, decayed));
}

/** Bonus granted when the solve creates the challenge's FirstBlood row. */
export function computeFirstBloodBonus(basePoints: number): number {
  return Math.max(FIRST_BLOOD_MIN_BONUS, Math.round(Math.max(0, basePoints) * FIRST_BLOOD_BONUS_RATIO));
}

/**
 * Total points written into Solve.pointsAwarded for this attempt.
 * `isFirstBlood` must reflect the outcome of the FirstBlood claim in the
 * same transaction (createMany + skipDuplicates count), so the bonus is
 * only ever granted to the row that actually created the first-blood record.
 */
export function computeAwardedPoints(
  challenge: ScorableChallenge,
  priorSolveCount: number,
  isFirstBlood: boolean
): number {
  const base = computeBaseAward(challenge, priorSolveCount);
  return base + (isFirstBlood ? computeFirstBloodBonus(base) : 0);
}
