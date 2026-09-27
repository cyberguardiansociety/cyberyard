import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { getActivity, getNotifications, getUnreadCount, markAllNotificationsRead, markNotificationRead } from '../controllers/notification.controller';

const router = Router();

router.get('/activity', requireAuth, asyncHandler(getActivity));
router.get('/notifications', requireAuth, asyncHandler(getNotifications));
router.get('/notifications/unread-count', requireAuth, asyncHandler(getUnreadCount));
router.patch('/notifications/:id/read', requireAuth, asyncHandler(markNotificationRead));
router.patch('/notifications/read-all', requireAuth, asyncHandler(markAllNotificationsRead));

export default router;
