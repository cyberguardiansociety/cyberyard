import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { getBadges, getBadgeById, getMyBadges } from '../controllers/badges.controller';
const router = Router();
router.get('/', requireAuth, asyncHandler(getBadges));
router.get('/me', requireAuth, asyncHandler(getMyBadges));
router.get('/:id', requireAuth, asyncHandler(getBadgeById));
export default router;
