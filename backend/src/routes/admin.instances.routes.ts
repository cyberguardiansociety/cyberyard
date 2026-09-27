import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { adminRateLimit } from '../middleware/adminRateLimit';
import { adminAudit } from '../middleware/adminAudit.middleware';
import { instanceResetRateLimit } from '../middleware/instanceResetRateLimit';
import { asyncHandler } from '../utils/asyncHandler';
import {
  listAdminInstancesHandler,
  adminResetInstanceHandler,
} from '../controllers/instance.controller';

const router = Router();

router.use(requireAuth, requireAdmin, adminRateLimit, adminAudit);

router.get('/instances', asyncHandler(listAdminInstancesHandler));
router.post('/instances/:slug/reset', instanceResetRateLimit, asyncHandler(adminResetInstanceHandler));

export default router;
