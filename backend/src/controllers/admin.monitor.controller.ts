import { Request, Response } from 'express';
import { submissionMonitorQuerySchema, firstBloodListQuerySchema, scoreAdjustSchema } from '../validation/monitor.schema';
import { adminChallengeIdParamSchema } from '../validation/admin.schema';
import { listSubmissions, listFirstBloods, createScoreAdjustment, resetChallengeSolves } from '../services/monitor.service';

/** GET /api/admin/submissions?limit=&offset=&userId=&challengeId=&correct= → { submissions, total, limit, offset }. */
export async function getAdminSubmissions(req: Request, res: Response): Promise<void> {
  const query = submissionMonitorQuerySchema.parse(req.query);
  res.status(200).json(await listSubmissions(query));
}

/** GET /api/admin/first-bloods?limit=&offset=&challengeId= → { firstBloods, total, limit, offset }. */
export async function getAdminFirstBloods(req: Request, res: Response): Promise<void> {
  const query = firstBloodListQuerySchema.parse(req.query);
  res.status(200).json(await listFirstBloods(query));
}

/** POST /api/admin/scores/adjust — { userId, delta, reason } → 201 { adjustment }. */
export async function postAdminScoreAdjust(req: Request, res: Response): Promise<void> {
  const input = scoreAdjustSchema.parse(req.body);
  const adjustment = await createScoreAdjustment(req.user!.id, input);
  res.status(201).json({ adjustment });
}

/** POST /api/admin/challenges/:id/reset-solves → { reset: true, deleted }. */
export async function postAdminChallengeResetSolves(req: Request, res: Response): Promise<void> {
  const { id } = adminChallengeIdParamSchema.parse(req.params);
  const result = await resetChallengeSolves(id);
  res.status(200).json(result);
}
