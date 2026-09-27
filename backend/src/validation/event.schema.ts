import { z } from 'zod';

const uuid = z.string().uuid();
const safeText = (max: number) => z.string().trim().min(1).max(max).refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value), 'Control characters are not allowed');
const optionalSafeText = (max: number) => z.string().trim().max(max).refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value), 'Control characters are not allowed').optional().transform((v) => v || undefined);

export const eventStatuses = ['DRAFT','UPCOMING','LIVE','ENDED','ARCHIVED'] as const;
export const eventSorts = ['start_asc','start_desc','newest','name_asc'] as const;

export const eventIdParamSchema = z.object({ id: uuid });
export const eventChallengeParamSchema = z.object({ id: uuid, challengeId: uuid });
export const eventAnnouncementParamSchema = z.object({ id: uuid, announcementId: uuid });

export const eventListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(['UPCOMING','LIVE','ENDED']).optional(),
  sort: z.enum(eventSorts).default('start_asc'),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

const eventDateFields = z.object({
  name: safeText(160),
  slug: z.string().trim().max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must contain lowercase letters, numbers and hyphens.').optional(),
  shortDescription: optionalSafeText(500),
  description: safeText(12000),
  registrationStartAt: z.coerce.date(),
  registrationEndAt: z.coerce.date(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  maxParticipants: z.coerce.number().int().min(1).max(100000).nullable().optional(),
  registrationRequired: z.boolean().default(true),
});

export const adminEventCreateSchema = eventDateFields.superRefine((value, ctx) => {
  if (value.registrationStartAt > value.registrationEndAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['registrationEndAt'], message: 'Registration must start before it ends.' });
  if (value.registrationEndAt > value.startAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['registrationEndAt'], message: 'Registration must end on or before the event starts.' });
  if (value.startAt >= value.endAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endAt'], message: 'Event start must be before event end.' });
});

export const adminEventUpdateSchema = eventDateFields.partial().superRefine((value, ctx) => {
  if (value.registrationStartAt && value.registrationEndAt && value.registrationStartAt > value.registrationEndAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['registrationEndAt'], message: 'Registration must start before it ends.' });
  if (value.registrationEndAt && value.startAt && value.registrationEndAt > value.startAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['registrationEndAt'], message: 'Registration must end on or before the event starts.' });
  if (value.startAt && value.endAt && value.startAt >= value.endAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endAt'], message: 'Event start must be before event end.' });
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export const eventChallengeCreateSchema = z.object({
  challengeId: uuid,
  position: z.coerce.number().int().min(1).max(10000).optional(),
  availableFrom: z.coerce.date().optional().nullable(),
  availableUntil: z.coerce.date().optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.availableFrom && value.availableUntil && value.availableFrom >= value.availableUntil) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['availableUntil'], message: 'Challenge availability must have a valid range.' });
});

export const eventChallengeOrderSchema = z.object({
  items: z.array(z.object({ challengeId: uuid, position: z.coerce.number().int().min(1).max(10000) })).min(1).max(500),
}).superRefine((value, ctx) => {
  const ids = new Set<string>(); const positions = new Set<number>();
  for (const item of value.items) {
    if (ids.has(item.challengeId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'Duplicate challenge IDs are not allowed.' });
    if (positions.has(item.position)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'Duplicate positions are not allowed.' });
    ids.add(item.challengeId); positions.add(item.position);
  }
});

export const eventAnnouncementCreateSchema = z.object({ title: safeText(160), content: safeText(5000) });
export const eventAnnouncementUpdateSchema = eventAnnouncementCreateSchema.partial().refine((v) => Object.keys(v).length > 0, 'At least one field is required.');

export const eventPaginationSchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(25), offset: z.coerce.number().int().min(0).max(10000).default(0) });
export const eventParticipantQuerySchema = eventPaginationSchema;
