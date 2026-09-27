import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { getDifficulties } from '../controllers/difficulties.controller';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// See categories.routes.ts — taxonomy is only consumed by the
// login-gated challenges view and the admin panel.
router.use(requireAuth);

router.get('/', asyncHandler(getDifficulties));

export default router;
