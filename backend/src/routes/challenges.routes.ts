import { Router } from 'express';
import { getChallenges, getChallenge, postSubmitFlag } from '../controllers/challenges.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { flagSubmitRateLimit } from '../middleware/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/', requireAuth, asyncHandler(getChallenges));
router.get('/:id', requireAuth, asyncHandler(getChallenge));
router.post('/:id/submit', requireAuth, flagSubmitRateLimit, asyncHandler(postSubmitFlag));

export default router;
