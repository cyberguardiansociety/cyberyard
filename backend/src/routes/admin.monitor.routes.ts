import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { adminRateLimit } from '../middleware/adminRateLimit';
import { adminAudit } from '../middleware/adminAudit.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import * as c from '../controllers/admin.monitor.controller';

const router = Router();
router.use(requireAuth, requireAdmin, adminRateLimit, adminAudit);

router.get('/submissions', asyncHandler(c.getAdminSubmissions));
router.get('/first-bloods', asyncHandler(c.getAdminFirstBloods));
router.post('/scores/adjust', asyncHandler(c.postAdminScoreAdjust));
router.post('/challenges/:id/reset-solves', asyncHandler(c.postAdminChallengeResetSolves));

export default router;
