import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { getMyAchievements, getMyCategoryProgress, getMyDifficultyProgress, getMyGamification, getMyProgress } from '../controllers/gamification.controller';

const router = Router();
router.get('/me', requireAuth, asyncHandler(getMyGamification));
router.get('/progress', requireAuth, asyncHandler(getMyProgress));
router.get('/achievements', requireAuth, asyncHandler(getMyAchievements));
router.get('/category-progress', requireAuth, asyncHandler(getMyCategoryProgress));
router.get('/difficulty-progress', requireAuth, asyncHandler(getMyDifficultyProgress));
export default router;
