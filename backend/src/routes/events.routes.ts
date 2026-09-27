import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { eventRateLimit } from '../middleware/eventRateLimit';
import * as c from '../controllers/event.controller';

const router = Router();
router.use(requireAuth);
router.get('/', asyncHandler(c.listEvents));
router.get('/:id', asyncHandler(c.getEvent));
router.get('/:id/challenges', asyncHandler(c.getEventChallenges));
router.get('/:id/leaderboard', asyncHandler(c.getEventLeaderboard));
router.get('/:id/announcements', asyncHandler(c.getEventAnnouncements));
router.get('/:id/stats', asyncHandler(c.getEventStats));
router.get('/:id/my-progress', asyncHandler(c.getMyProgress));
router.post('/:id/register', eventRateLimit('registration'), asyncHandler(c.registerEvent));
router.delete('/:id/register', eventRateLimit('registration'), asyncHandler(c.unregisterEvent));
export default router;
