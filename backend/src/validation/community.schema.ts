import { z } from 'zod';

const uuid = z.string().uuid();
const safeText = (max: number) => z.string().trim().min(1).max(max).refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value), 'Control characters are not allowed');

export const communityCategories = ['GENERAL','CTF','WEB_SECURITY','NETWORK_SECURITY','CRYPTOGRAPHY','FORENSICS','REVERSE_ENGINEERING','OSINT','LEARNING','ANNOUNCEMENTS'] as const;
export const communityReportReasons = ['SPAM','HARASSMENT','ABUSE','OFFENSIVE_CONTENT','MALICIOUS_CONTENT','SECURITY_ABUSE','OTHER'] as const;
export const communityReportStatuses = ['PENDING','REVIEWED','RESOLVED','DISMISSED'] as const;

export const communityFeedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
  category: z.enum(communityCategories).optional(),
  search: z.string().trim().max(120).optional(),
  sort: z.enum(['newest','most_liked','most_discussed']).default('newest'),
});
export const communityPostCreateSchema = z.object({
  title: safeText(160),
  content: safeText(10000),
  category: z.enum(communityCategories).default('GENERAL'),
});
export const communityPostUpdateSchema = communityPostCreateSchema.partial().refine((v) => Object.keys(v).length > 0, 'At least one field is required');
export const communityCommentCreateSchema = z.object({ content: safeText(5000) });
export const communityCommentUpdateSchema = communityCommentCreateSchema;
export const communityCommentListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(30), offset: z.coerce.number().int().min(0).max(10000).default(0) });
export const postIdParamSchema = z.object({ id: uuid });
export const commentIdParamSchema = z.object({ id: uuid, commentId: uuid });
export const userIdParamSchema = z.object({ id: uuid });
export const reportCreateSchema = z.object({
  postId: uuid.optional(),
  commentId: uuid.optional(),
  reason: z.enum(communityReportReasons),
  description: z.string().trim().max(2000).refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value), 'Control characters are not allowed').optional().transform((v) => v || undefined),
}).refine((v) => (v.postId ? 1 : 0) + (v.commentId ? 1 : 0) === 1, 'Exactly one report target is required');
export const reportListQuerySchema = z.object({
  status: z.enum(communityReportStatuses).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export const reportIdParamSchema = z.object({ id: uuid });
export const reportResolutionSchema = z.object({ status: z.enum(['REVIEWED','RESOLVED','DISMISSED']) });
export const profileUpdateSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_]+$/, 'Username may contain only letters, numbers, and underscores.').optional(),
  bio: z.string().trim().max(500).refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value), 'Control characters are not allowed').optional().transform((v) => v || undefined),
  avatarUrl: z.string().trim().max(500).url().refine((value) => /^https?:\/\//i.test(value), 'Avatar URL must use http or https.').optional().nullable(),
}).refine((v) => Object.keys(v).length > 0, 'At least one profile field is required');
export const userListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), offset: z.coerce.number().int().min(0).max(10000).default(0) });

export type CommunityPostCreateInput = z.infer<typeof communityPostCreateSchema>;
export type CommunityPostUpdateInput = z.infer<typeof communityPostUpdateSchema>;
export type CommunityCommentCreateInput = z.infer<typeof communityCommentCreateSchema>;
export type CommunityCommentUpdateInput = z.infer<typeof communityCommentUpdateSchema>;
export type ReportCreateInput = z.infer<typeof reportCreateSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
