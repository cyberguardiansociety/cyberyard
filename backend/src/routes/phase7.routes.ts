import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { getChallengeHints, postUnlockHint, getChallengeFiles, downloadChallengeFile, getChallengeWriteup } from '../controllers/phase7.controller';

const router = Router();
router.use(requireAuth);
router.get('/:id/hints', asyncHandler(getChallengeHints));
router.post('/:id/hints/:hintId/unlock', asyncHandler(postUnlockHint));
router.get('/:id/files', asyncHandler(getChallengeFiles));
router.get('/:id/files/:fileId/download', asyncHandler(downloadChallengeFile));
router.get('/:id/writeup', asyncHandler(getChallengeWriteup));

export default router;
