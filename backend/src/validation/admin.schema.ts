import { z } from 'zod';

const uuidSchema = z.string().uuid('Invalid ID.');
export const adminChallengeIdParamSchema = z.object({ id: uuidSchema });

// Enum values mirror the Prisma enums (ScoringMode / FlagMode); keeping
// them as string literals here avoids importing the generated client into
// the validation layer.
const scoringModeSchema = z.enum(['STATIC', 'DYNAMIC']);
const flagModeSchema = z.enum(['STATIC', 'DYNAMIC']);

const challengeText = z.string().trim().min(1).max(10000);

export const adminChallengeCreateSchema = z.object({
  title: z.string().trim().min(1).max(128),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must contain lowercase letters, numbers, and hyphens.').max(160).optional(),
  teaser: z.string().trim().max(500).nullable().optional(),
  description: challengeText,
  categoryId: z.coerce.number().int().positive(),
  difficultyId: z.coerce.number().int().positive(),
  points: z.coerce.number().int().min(1).max(100000),
  scoringMode: scoringModeSchema.default('STATIC'),
  flag: z.string().trim().min(1).max(1024),
  caseSensitive: z.boolean().default(true),
  flagMode: flagModeSchema.default('STATIC'),
  prerequisiteId: uuidSchema.nullable().optional(),
});

export const adminChallengeUpdateSchema = z.object({
  title: z.string().trim().min(1).max(128).optional(),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must contain lowercase letters, numbers, and hyphens.').max(160).optional(),
  teaser: z.string().trim().max(500).nullable().optional(),
  description: challengeText.optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  difficultyId: z.coerce.number().int().positive().optional(),
  points: z.coerce.number().int().min(1).max(100000).optional(),
  scoringMode: scoringModeSchema.optional(),
  flag: z.string().trim().min(1).max(1024).optional(),
  caseSensitive: z.boolean().optional(),
  flagMode: flagModeSchema.optional(),
  prerequisiteId: uuidSchema.nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field must be provided.',
});

export const adminChallengeListQuerySchema = z.object({
  search: z.string().trim().max(128).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  difficultyId: z.coerce.number().int().positive().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED', 'ALL']).default('ALL'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});

export const adminCategoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(64),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must contain lowercase letters, numbers, and hyphens.').max(64),
});
export const adminCategoryUpdateSchema = adminCategoryCreateSchema.partial().refine((value) => Object.keys(value).length > 0, { message: 'At least one field must be provided.' });
export const adminCategoryIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const adminDifficultyCreateSchema = z.object({ name: z.string().trim().min(1).max(32), sortOrder: z.coerce.number().int().min(0).max(100000) });
export const adminDifficultyUpdateSchema = adminDifficultyCreateSchema.partial().refine((value) => Object.keys(value).length > 0, { message: 'At least one field must be provided.' });
export const adminDifficultyIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export type AdminChallengeCreateInput = z.infer<typeof adminChallengeCreateSchema>;
export type AdminChallengeUpdateInput = z.infer<typeof adminChallengeUpdateSchema>;
export type AdminChallengeListQuery = z.infer<typeof adminChallengeListQuerySchema>;
export type AdminCategoryCreateInput = z.infer<typeof adminCategoryCreateSchema>;
export type AdminCategoryUpdateInput = z.infer<typeof adminCategoryUpdateSchema>;
export type AdminDifficultyCreateInput = z.infer<typeof adminDifficultyCreateSchema>;
export type AdminDifficultyUpdateInput = z.infer<typeof adminDifficultyUpdateSchema>;
