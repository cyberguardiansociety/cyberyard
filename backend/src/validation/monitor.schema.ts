import { z } from 'zod';

const uuid = z.string().uuid('Invalid ID.');

/** Shared pagination for the admin monitoring lists. */
const monitorPagination = {
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
};

/** GET /api/admin/submissions — optional narrowing filters. */
export const submissionMonitorQuerySchema = z.object({
  userId: uuid.optional(),
  challengeId: uuid.optional(),
  correct: z.enum(['correct', 'incorrect']).optional(),
  ...monitorPagination,
});

/** GET /api/admin/first-bloods */
export const firstBloodListQuerySchema = z.object({
  challengeId: uuid.optional(),
  ...monitorPagination,
});

/**
 * POST /api/admin/scores/adjust — |delta| is capped at 10000 and may not
 * be zero; a reason is mandatory because it is stored with the row and
 * shown alongside the adjustment forever.
 */
export const scoreAdjustSchema = z.object({
  userId: uuid,
  delta: z.coerce.number().int().min(-10000).max(10000).refine((value) => value !== 0, 'Delta must not be zero.'),
  reason: z.string().trim().min(1).max(200).refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value), 'Control characters are not allowed'),
});

export type SubmissionMonitorQuery = z.infer<typeof submissionMonitorQuerySchema>;
export type FirstBloodListQuery = z.infer<typeof firstBloodListQuerySchema>;
export type ScoreAdjustInput = z.infer<typeof scoreAdjustSchema>;
