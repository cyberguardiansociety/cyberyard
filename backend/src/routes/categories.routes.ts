import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { getCategories } from '../controllers/categories.controller';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Taxonomy only feeds the (login-gated) challenges view and the admin
// panel — anonymous callers have no legitimate use for it, so it stays
// authenticated (broken-access-control hardening).
router.use(requireAuth);

router.get('/', asyncHandler(getCategories));

export default router;
