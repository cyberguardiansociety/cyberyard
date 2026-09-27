import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { adminRateLimit } from '../middleware/adminRateLimit';
import { adminAudit } from '../middleware/adminAudit.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { uploadChallengeFile } from '../middleware/upload.middleware';
import {
  getAdminChallengeHints, postAdminChallengeHint, patchAdminChallengeHint, deleteAdminChallengeHint,
  getAdminChallengeFiles, postAdminChallengeFile, patchAdminChallengeFile, deleteAdminChallengeFile,
  getAdminChallengeWriteup, postAdminChallengeWriteup, patchAdminChallengeWriteup, deleteAdminChallengeWriteup,
} from '../controllers/phase7.controller';

const router = Router();
router.use(requireAuth, requireAdmin, adminRateLimit, adminAudit);

router.get('/challenges/:id/hints', asyncHandler(getAdminChallengeHints));
router.post('/challenges/:id/hints', asyncHandler(postAdminChallengeHint));
router.patch('/challenges/:id/hints/:hintId', asyncHandler(patchAdminChallengeHint));
router.delete('/challenges/:id/hints/:hintId', asyncHandler(deleteAdminChallengeHint));

router.get('/challenges/:id/files', asyncHandler(getAdminChallengeFiles));
router.post('/challenges/:id/files', uploadChallengeFile, asyncHandler(postAdminChallengeFile));
router.patch('/challenges/:id/files/:fileId', asyncHandler(patchAdminChallengeFile));
router.delete('/challenges/:id/files/:fileId', asyncHandler(deleteAdminChallengeFile));

router.get('/challenges/:id/writeup', asyncHandler(getAdminChallengeWriteup));
router.post('/challenges/:id/writeup', asyncHandler(postAdminChallengeWriteup));
router.patch('/challenges/:id/writeup', asyncHandler(patchAdminChallengeWriteup));
router.delete('/challenges/:id/writeup', asyncHandler(deleteAdminChallengeWriteup));

export default router;
