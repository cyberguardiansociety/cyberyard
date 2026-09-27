import { z } from 'zod';

const uuid = z.string().uuid();
const safeText = (max: number) => z.string().trim().min(1).max(max).refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value), 'Control characters are not allowed');

export const badgeIdParamSchema = z.object({ id: uuid });
export const badgeCreateSchema = z.object({
  name: safeText(80),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: safeText(500),
  icon: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9._:-]+$/),
  criteria: z.discriminatedUnion('type', [
    z.object({ type: z.literal('first_solve') }),
    z.object({ type: z.literal('solved_count'), count: z.number().int().min(1).max(100000) }),
    z.object({ type: z.literal('total_points'), points: z.number().int().min(1).max(100000000) }),
    z.object({ type: z.literal('category_solved'), categoryId: z.number().int().positive(), count: z.number().int().min(1).max(100000) }),
    z.object({ type: z.literal('streak'), days: z.number().int().min(1).max(10000) }),
    z.object({ type: z.literal('level'), level: z.number().int().min(1).max(1000) }),
    z.object({ type: z.literal('first_blood_count'), count: z.number().int().min(1).max(100000) }),
    z.object({ type: z.literal('difficulty_solved'), difficultyId: z.number().int().positive(), count: z.number().int().min(1).max(100000) }),
  ]),
  isEnabled: z.boolean().default(true),
});
export const badgeUpdateSchema = badgeCreateSchema.partial().extend({
  criteria: badgeCreateSchema.shape.criteria.optional(),
});

export const postIdParamSchema = z.object({ id: uuid });
export const commentIdParamSchema = z.object({ id: uuid, commentId: uuid });
export const communityListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export const communityPostCreateSchema = z.object({ title: safeText(160), content: safeText(10000) });
export const communityPostUpdateSchema = communityPostCreateSchema.partial().refine((v) => Object.keys(v).length > 0, 'At least one field is required');
export const communityCommentCreateSchema = z.object({ content: safeText(5000) });
export const communityCommentUpdateSchema = communityCommentCreateSchema;

export type BadgeCreateInput = z.infer<typeof badgeCreateSchema>;
export type BadgeUpdateInput = z.infer<typeof badgeUpdateSchema>;
export type CommunityPostCreateInput = z.infer<typeof communityPostCreateSchema>;
export type CommunityPostUpdateInput = z.infer<typeof communityPostUpdateSchema>;
export type CommunityCommentCreateInput = z.infer<typeof communityCommentCreateSchema>;
export type CommunityCommentUpdateInput = z.infer<typeof communityCommentUpdateSchema>;
