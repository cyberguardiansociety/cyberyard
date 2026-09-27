import { z } from 'zod';

export const listChallengesQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(64).optional(),
  difficulty: z.string().trim().max(32).optional(),
  solved: z.enum(['all', 'solved', 'unsolved']).default('all'),
  sort: z.enum(['newest', 'oldest', 'points_desc', 'points_asc', 'solves_desc', 'title_asc']).default('newest'),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});
export type ListChallengesQuery = z.infer<typeof listChallengesQuerySchema>;

export const challengeIdParamSchema = z.object({
  id: z.string().uuid('Invalid challenge id'),
});

export const submitFlagSchema = z.object({
  flag: z
    .string()
    .trim()
    .min(1, 'Flag is required')
    .max(256, 'Flag is too long'),
});
export type SubmitFlagInput = z.infer<typeof submitFlagSchema>;
