import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { adminRateLimit } from '../middleware/adminRateLimit';
import { adminAudit } from '../middleware/adminAudit.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { streamStats } from '../utils/realtime';

const router = Router();

// Standard admin guard — same shape as every other admin route file.
router.use(requireAuth, requireAdmin, adminRateLimit, adminAudit);

/** Live SSE hub capacity snapshot for the admin panel's System tab. */
router.get(
  '/realtime-stats',
  asyncHandler(async (_req, res) => {
    res.json({ realtime: streamStats() });
  }),
);

export default router;
