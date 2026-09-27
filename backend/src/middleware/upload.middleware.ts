import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 2,
    parts: 3,
    fieldNameSize: 100,
    fieldSize: 16 * 1024,
    fieldNestingDepth: 5,
    headerPairs: 100,
  },
});

export function uploadChallengeFile(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      const code = err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'FILE_UPLOAD_INVALID';
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      next(new ApiError(status, err.code === 'LIMIT_FILE_SIZE' ? 'File must not exceed 10 MB.' : 'Invalid file upload.', code));
      return;
    }
    next(new ApiError(400, 'Invalid file upload.', 'FILE_UPLOAD_INVALID'));
  });
}
