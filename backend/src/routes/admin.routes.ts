import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { adminRateLimit } from '../middleware/adminRateLimit';
import { adminAudit } from '../middleware/adminAudit.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import {
  getAdminOverviewStats,
  getAdminChallenges,
  getAdminChallengeById,
  postAdminChallenge,
  patchAdminChallenge,
  deleteAdminChallengeById,
  postPublishAdminChallenge,
  postUnpublishAdminChallenge,
  postArchiveAdminChallenge,
  getAdminCategories,
  postAdminCategory,
  patchAdminCategory,
  deleteAdminCategoryById,
  getAdminDifficulties,
  postAdminDifficulty,
  patchAdminDifficulty,
  deleteAdminDifficultyById,
} from '../controllers/admin.controller';

const router = Router();

router.use(requireAuth, requireAdmin, adminRateLimit, adminAudit);

router.get('/overview', asyncHandler(getAdminOverviewStats));
router.get('/challenges', asyncHandler(getAdminChallenges));
router.post('/challenges', asyncHandler(postAdminChallenge));
router.get('/challenges/:id', asyncHandler(getAdminChallengeById));
router.patch('/challenges/:id', asyncHandler(patchAdminChallenge));
router.post('/challenges/:id/publish', asyncHandler(postPublishAdminChallenge));
router.post('/challenges/:id/unpublish', asyncHandler(postUnpublishAdminChallenge));
router.post('/challenges/:id/archive', asyncHandler(postArchiveAdminChallenge));
router.delete('/challenges/:id', asyncHandler(deleteAdminChallengeById));

router.get('/categories', asyncHandler(getAdminCategories));
router.post('/categories', asyncHandler(postAdminCategory));
router.patch('/categories/:id', asyncHandler(patchAdminCategory));
router.delete('/categories/:id', asyncHandler(deleteAdminCategoryById));

router.get('/difficulties', asyncHandler(getAdminDifficulties));
router.post('/difficulties', asyncHandler(postAdminDifficulty));
router.patch('/difficulties/:id', asyncHandler(patchAdminDifficulty));
router.delete('/difficulties/:id', asyncHandler(deleteAdminDifficultyById));

export default router;
