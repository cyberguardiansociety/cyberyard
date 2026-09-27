import { Request, Response } from 'express';
import { activityListQuerySchema, notificationIdParamSchema, notificationListQuerySchema } from '../validation/notification.schema';
import * as notifications from '../services/notification.service';
import * as activity from '../services/activity.service';

export async function getNotifications(req: Request, res: Response): Promise<void> {
  const query = notificationListQuerySchema.parse(req.query);
  res.json(await notifications.listNotifications(req.user!.id, query));
}

export async function getUnreadCount(req: Request, res: Response): Promise<void> {
  res.json({ unread: await notifications.getUnreadNotificationCount(req.user!.id) });
}

export async function markNotificationRead(req: Request, res: Response): Promise<void> {
  const { id } = notificationIdParamSchema.parse(req.params);
  res.json(await notifications.markNotificationRead(req.user!.id, id));
}

export async function markAllNotificationsRead(req: Request, res: Response): Promise<void> {
  res.json(await notifications.markAllNotificationsRead(req.user!.id));
}

export async function getActivity(req: Request, res: Response): Promise<void> {
  const query = activityListQuerySchema.parse(req.query);
  res.json(await activity.listActivity(req.user!.id, query));
}
