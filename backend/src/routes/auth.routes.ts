import { Router } from 'express';
import { register, login, logout, me, forgotPassword, resetPassword, verifyEmailAddress, resendVerificationEmail, changeUserPassword, getSessions, revokeSession, revokeOtherSessions } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { authRateLimit } from '../middleware/authRateLimit';
import { accountSecurityRateLimit } from '../middleware/accountSecurityRateLimit';
import { authTarpit } from '../middleware/authTarpit';

const router = Router();
// Order matters: the tarpit (progressive delay/lockout) runs BEFORE the
// limiter so even requests about to be rejected are slowed, then the
// bounded per-IP/per-account limiter.
router.post('/register', authTarpit('register'), authRateLimit('register'), asyncHandler(register));
router.post('/login', authTarpit('login'), authRateLimit('login'), asyncHandler(login));
router.post('/logout', authRateLimit('logout'), asyncHandler(logout));
router.get('/me', requireAuth, asyncHandler(me));
router.post('/forgot-password', accountSecurityRateLimit('passwordReset'), asyncHandler(forgotPassword));
router.post('/reset-password', accountSecurityRateLimit('passwordReset'), asyncHandler(resetPassword));
router.post('/verify-email', accountSecurityRateLimit('verifyEmail'), asyncHandler(verifyEmailAddress));
router.post('/resend-verification', requireAuth, accountSecurityRateLimit('verifyEmail'), asyncHandler(resendVerificationEmail));
router.post('/change-password', requireAuth, accountSecurityRateLimit('passwordChange'), asyncHandler(changeUserPassword));
router.get('/sessions', requireAuth, asyncHandler(getSessions));
router.delete('/sessions/others', requireAuth, authRateLimit('logout'), asyncHandler(revokeOtherSessions));
router.delete('/sessions/:id', requireAuth, authRateLimit('logout'), asyncHandler(revokeSession));

export default router;
