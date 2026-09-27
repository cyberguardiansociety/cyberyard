import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { adminRateLimit } from '../middleware/adminRateLimit';
import { instanceResetRateLimit } from '../middleware/instanceResetRateLimit';
import { asyncHandler } from '../utils/asyncHandler';
import {
  listInstancesHandler,
  getInstanceStatusHandler,
  resetInstanceHandler,
} from '../controllers/instance.controller';

/**
 * Authenticated challenge-instance endpoints. `adminRateLimit` is reused as
 * the router-wide capped limiter (safe methods pass through; mutations are
 * capped per authenticated user), and the destructive action — instance
 * reset — is capped harder by `instanceResetRateLimit` (5/min/user).
 */
const router = Router();

router.use(requireAuth, adminRateLimit);

router.get('/', asyncHandler(listInstancesHandler));
router.get('/:slug/status', asyncHandler(getInstanceStatusHandler));
router.post('/:slug/reset', instanceResetRateLimit, asyncHandler(resetInstanceHandler));

export default router;
