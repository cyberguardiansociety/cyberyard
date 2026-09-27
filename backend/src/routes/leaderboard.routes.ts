import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth.middleware';
import { getLeaderboardController } from '../controllers/leaderboard.controller';

const router = Router();

router.get('/', requireAuth, asyncHandler(getLeaderboardController));

export default router;
