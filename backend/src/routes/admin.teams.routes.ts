import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { adminRateLimit } from '../middleware/adminRateLimit';
import { adminAudit } from '../middleware/adminAudit.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import * as c from '../controllers/admin.team.controller';

const router = Router();
router.use(requireAuth, requireAdmin, adminRateLimit, adminAudit);

router.get('/teams', asyncHandler(c.getAdminTeams));
router.delete('/teams/:id', asyncHandler(c.deleteAdminTeamById));
router.post('/teams/:id/transfer', asyncHandler(c.postAdminTeamTransfer));
router.post('/teams/:id/kick', asyncHandler(c.postAdminTeamKick));

export default router;
