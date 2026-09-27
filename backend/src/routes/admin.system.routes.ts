import { Router } from 'express';
import { constants as fsConstants, promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { adminRateLimit } from '../middleware/adminRateLimit';
import { adminAudit } from '../middleware/adminAudit.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';

/** Admin-only, bounded tail reader for the active rotating application log. */
const router = Router();
router.use(requireAuth, requireAdmin, adminRateLimit, adminAudit);

const MAX_TAIL_BYTES = 256 * 1024;
const querySchema = z.object({
  lines: z.coerce.number().int().min(1).max(500).default(200),
  file: z.string().max(32).optional(),
});

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function stripAnsi(value: string): string {
  // CSI colour/cursor sequences and OSC strings (including an ESC-\ terminator).
  return value
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '')
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

router.get(
  '/system/logs',
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);
    logger.info('admin_log_tail', { lines: query.lines });
    const requestedFile = query.file ?? 'app.log';
    if (requestedFile !== 'app.log' && !/^app\.log(?:\.\d{1,2})?$/.test(requestedFile)) {
      throw new ApiError(400, 'Invalid log filename.', 'INVALID_LOG_FILE');
    }

    // Resolve the configured directory once, then require the final component
    // to be a regular file inside that real directory. O_NOFOLLOW below closes
    // the common symlink-swap race after the checks.
    const configuredDir = path.resolve(process.cwd(), process.env.LOG_DIR || 'logs');
    let realDir: string;
    try {
      realDir = await fs.realpath(configuredDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        res.json({ file: requestedFile, lines: [] });
        return;
      }
      throw new ApiError(500, 'Log directory is unavailable.', 'LOG_READ_FAILED');
    }

    const candidate = path.resolve(realDir, requestedFile);
    if (!isInside(realDir, candidate) || path.dirname(candidate) !== realDir) {
      throw new ApiError(400, 'Invalid log filename.', 'INVALID_LOG_FILE');
    }

    let handle;
    try {
      const linkStat = await fs.lstat(candidate);
      if (linkStat.isSymbolicLink() || !linkStat.isFile()) {
        throw new ApiError(400, 'Invalid log file.', 'INVALID_LOG_FILE');
      }
      const realFile = await fs.realpath(candidate);
      if (!isInside(realDir, realFile) || path.dirname(realFile) !== realDir) {
        throw new ApiError(400, 'Invalid log file.', 'INVALID_LOG_FILE');
      }

      // O_NOFOLLOW makes the final open refuse a symlink, including one
      // introduced after the lstat/realpath checks above.
      handle = await fs.open(candidate, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
      const stat = await handle.stat();
      if (!stat.isFile()) {
        throw new ApiError(400, 'Invalid log file.', 'INVALID_LOG_FILE');
      }

      const readLength = Math.min(MAX_TAIL_BYTES, stat.size);
      const start = Math.max(0, stat.size - readLength);
      const buffer = Buffer.alloc(readLength);
      let offset = 0;
      while (offset < readLength) {
        const result = await handle.read(buffer, offset, readLength - offset, start + offset);
        if (!result.bytesRead) break;
        offset += result.bytesRead;
      }

      let text = stripAnsi(buffer.subarray(0, offset).toString('utf8'));
      let lines = text.split(/\r?\n/);
      // When the cap begins in the middle of a line, do not present a partial
      // first record as a complete log entry.
      if (start > 0 && lines.length) lines.shift();
      if (lines.length && lines[lines.length - 1] === '') lines.pop();
      lines = lines.slice(-query.lines);
      res.json({ file: requestedFile, lines });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        res.json({ file: requestedFile, lines: [] });
        return;
      }
      if (code === 'ELOOP' || code === 'EACCES' || code === 'EPERM') {
        throw new ApiError(400, 'Invalid log file.', 'INVALID_LOG_FILE');
      }
      throw new ApiError(500, 'Unable to read the log tail.', 'LOG_READ_FAILED');
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }),
);

export default router;
