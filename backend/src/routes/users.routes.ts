import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth.middleware';
import { getMyStats, getUserStatsById } from '../controllers/leaderboard.controller';

const router = Router();

router.get('/me/stats', requireAuth, asyncHandler(getMyStats));
router.get('/:id/stats', requireAuth, asyncHandler(getUserStatsById));

export default router;
