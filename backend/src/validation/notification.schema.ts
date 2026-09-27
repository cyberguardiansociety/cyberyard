import { z } from 'zod';

export const notificationListQuerySchema = z.object({
  read: z.enum(['all', 'unread', 'read']).default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});

export const notificationIdParamSchema = z.object({
  id: z.string().uuid('Invalid notification id'),
});

export const activityListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});
