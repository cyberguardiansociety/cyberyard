import { Router } from 'express';
import { register, login, logout, me, verifyEmailAddress, resendVerificationEmail, changeUserPassword, getSessions, revokeSession, revokeOtherSessions } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { authRateLimit } from '../middleware/authRateLimit';
import { accountSecurityRateLimit } from '../middleware/accountSecurityRateLimit';
import { authTarpit } from '../middleware/authTarpit';

const router = Router();
// Order matters: the tarpit (progressive delay/lockout) runs BEFORE the
// limiter so even requests about to be rejected are slowed, then the
// bounded per-IP/per-account limiter.
//
// There is no emailed password recovery. The range is self-hosted and
// deliberately does not ship a "forgot password" flow: a reset endpoint is
// an unauthenticated credential-mutation surface, and the account owner
// already has a strong recovery path from Settings in any live session.
router.post('/register', authTarpit('register'), authRateLimit('register'), asyncHandler(register));
router.post('/login', authTarpit('login'), authRateLimit('login'), asyncHandler(login));
router.post('/logout', authRateLimit('logout'), asyncHandler(logout));
router.get('/me', requireAuth, asyncHandler(me));
router.post('/verify-email', accountSecurityRateLimit('verifyEmail'), asyncHandler(verifyEmailAddress));
router.post('/resend-verification', requireAuth, accountSecurityRateLimit('verifyEmail'), asyncHandler(resendVerificationEmail));
router.post('/change-password', requireAuth, accountSecurityRateLimit('passwordChange'), asyncHandler(changeUserPassword));
router.get('/sessions', requireAuth, asyncHandler(getSessions));
router.delete('/sessions/others', requireAuth, authRateLimit('logout'), asyncHandler(revokeOtherSessions));
router.delete('/sessions/:id', requireAuth, authRateLimit('logout'), asyncHandler(revokeSession));

export default router;
