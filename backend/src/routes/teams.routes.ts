import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { communityWriteRateLimit } from '../middleware/communityRateLimit';
import { asyncHandler } from '../utils/asyncHandler';
import * as c from '../controllers/team.controller';

const router = Router();

router.use(requireAuth);

// Mutations reuse the existing bounded community limiter (hard MAX_BUCKETS
// cap → 429, per action+user key; an unknown kind falls back to the generic
// per-user cap). Reads are covered by the app-wide globalRateLimit.
router.post('/', communityWriteRateLimit('team'), asyncHandler(c.postCreateTeam));
router.post('/join', communityWriteRateLimit('team'), asyncHandler(c.postJoinTeam));
router.post('/leave', communityWriteRateLimit('team'), asyncHandler(c.postLeaveTeam));
router.post('/kick', communityWriteRateLimit('team'), asyncHandler(c.postKickMember));
router.post('/regenerate-code', communityWriteRateLimit('team'), asyncHandler(c.postRegenerateCode));
router.post('/dissolve', communityWriteRateLimit('team'), asyncHandler(c.postDissolveTeam));

router.get('/mine', asyncHandler(c.getMyTeamController));
// Registered before '/:id' so the literal path is never swallowed by the param route.
router.get('/leaderboard', asyncHandler(c.getTeamLeaderboardController));
router.get('/', asyncHandler(c.listTeamsController));
router.get('/:id', asyncHandler(c.getTeamByIdController));

export default router;
