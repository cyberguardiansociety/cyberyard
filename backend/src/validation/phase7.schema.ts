import { z } from 'zod';

const uuid = z.string().uuid('Invalid ID.');

export const challengeIdParamSchema = z.object({ id: uuid });
export const hintIdParamSchema = z.object({ id: uuid, hintId: uuid });
export const fileIdParamSchema = z.object({ id: uuid, fileId: uuid });

export const hintCreateSchema = z.object({
  title: z.string().trim().min(1).max(128),
  content: z.string().trim().min(1).max(10000),
  cost: z.coerce.number().int().min(0).max(100000),
  sortOrder: z.coerce.number().int().min(0).max(100000),
  isEnabled: z.boolean().default(true),
});

export const hintUpdateSchema = hintCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field must be provided.' }
);

export const fileUpdateSchema = z.object({
  originalName: z.string().trim().min(1).max(255).optional(),
  isEnabled: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field must be provided.',
});

export const writeupCreateSchema = z.object({
  content: z.string().trim().min(1).max(50000),
  isPublished: z.boolean().default(false),
});

export const writeupUpdateSchema = writeupCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field must be provided.' }
);

export type HintCreateInput = z.infer<typeof hintCreateSchema>;
export type HintUpdateInput = z.infer<typeof hintUpdateSchema>;
export type FileUpdateInput = z.infer<typeof fileUpdateSchema>;
export type WriteupCreateInput = z.infer<typeof writeupCreateSchema>;
export type WriteupUpdateInput = z.infer<typeof writeupUpdateSchema>;
