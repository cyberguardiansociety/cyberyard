import { Request, Response } from 'express';
import { listChallengesQuerySchema, challengeIdParamSchema, submitFlagSchema } from '../validation/challenges.schema';
import { listChallenges, getChallengeById } from '../services/challenge.service';
import { submitFlag } from '../services/submission.service';

/**
 * GET /api/challenges?search=&category=&difficulty=
 *
 * listChallenges already returns the complete envelope — { challenges, total,
 * solvedTotal, limit, offset }. Serialize it as-is. Re-wrapping it as
 * `{ challenges }` produced a double-nested body, so the client's
 * `response.challenges` was an object rather than an array: the grid threw
 * "list.map is not a function" and total/solvedTotal were always undefined,
 * which also left the progress bar stuck at 0/0.
 */
export async function getChallenges(req: Request, res: Response): Promise<void> {
  const query = listChallengesQuerySchema.parse(req.query);
  const page = await listChallenges(query, req.user!.id);
  res.status(200).json(page);
}

/** GET /api/challenges/:id */
export async function getChallenge(req: Request, res: Response): Promise<void> {
  const { id } = challengeIdParamSchema.parse(req.params);
  const challenge = await getChallengeById(id, req.user!.id);
  res.status(200).json({ challenge });
}

/**
 * POST /api/challenges/:id/submit
 *
 * Protected by requireAuth + flagSubmitRateLimit on the route, so by the
 * time this runs, req.user is guaranteed to be set.
 */
export async function postSubmitFlag(req: Request, res: Response): Promise<void> {
  const { id } = challengeIdParamSchema.parse(req.params);
  const { flag } = submitFlagSchema.parse(req.body);

  const result = await submitFlag(req.user!.id, id, flag, { ipAddress: req.ip ?? null });

  res.status(200).json(result);
}
