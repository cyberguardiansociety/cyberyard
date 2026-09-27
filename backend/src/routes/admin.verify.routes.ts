import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { adminRateLimit } from '../middleware/adminRateLimit';
import { adminAudit } from '../middleware/adminAudit.middleware';
import { accountSecurityRateLimit } from '../middleware/accountSecurityRateLimit';
import { asyncHandler } from '../utils/asyncHandler';
import { prisma } from '../utils/prisma';
import { verifyPassword } from '../utils/password';
import { logger } from '../utils/logger';

/**
 * Short-lived identity confirmation for high-impact operator actions.
 * The browser keeps only the returned expiry timestamp; it never receives
 * the password again and the server never logs the submitted secret.
 */
const router = Router();

router.use(requireAuth, requireAdmin, adminRateLimit, adminAudit);

const identitySchema = z.object({
  password: z.string().min(1).max(1024),
});

router.post(
  '/verify-identity',
  accountSecurityRateLimit('passwordChange'),
  asyncHandler(async (req, res) => {
    const { password } = identitySchema.parse(req.body);
    const userId = req.user!.id;
    let confirmed = false;

    // A missing record, malformed hash, database hiccup, and a wrong password
    // intentionally share one indistinguishable response to the caller.
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
      });
      confirmed = !!user?.passwordHash && await verifyPassword(user.passwordHash, password);
    } catch (_) {
      confirmed = false;
    }

    if (!confirmed) {
      res.status(401).json({ error: { code: 'IDENTITY_NOT_CONFIRMED' } });
      return;
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    logger.info('admin_identity_verified', { userId });
    res.json({ verified: true, expiresAt });
  }),
);

export default router;
