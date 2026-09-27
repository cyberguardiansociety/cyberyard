import { Request, Response } from 'express';
import { teamIdParamSchema, teamListQuerySchema, adminTeamTransferSchema, adminTeamKickSchema } from '../validation/teams.schema';
import { adminListTeams, adminTransferCaptain, adminKickMember, dissolveTeamById } from '../services/team.service';

/** GET /api/admin/teams?limit=&offset= → { teams, total, limit, offset }. */
export async function getAdminTeams(req: Request, res: Response): Promise<void> {
  const query = teamListQuerySchema.parse(req.query);
  res.status(200).json(await adminListTeams(query));
}

/** DELETE /api/admin/teams/:id → { deleted: true } — memberships first, then the team; user rows untouched. */
export async function deleteAdminTeamById(req: Request, res: Response): Promise<void> {
  const { id } = teamIdParamSchema.parse(req.params);
  await dissolveTeamById(id);
  res.status(200).json({ deleted: true });
}

/** POST /api/admin/teams/:id/transfer — { userId } → { team }. */
export async function postAdminTeamTransfer(req: Request, res: Response): Promise<void> {
  const { id } = teamIdParamSchema.parse(req.params);
  const input = adminTeamTransferSchema.parse(req.body);
  const team = await adminTransferCaptain(id, input.userId);
  res.status(200).json({ team });
}

/** POST /api/admin/teams/:id/kick — { userId } → { kicked: true, userId }. */
export async function postAdminTeamKick(req: Request, res: Response): Promise<void> {
  const { id } = teamIdParamSchema.parse(req.params);
  const input = adminTeamKickSchema.parse(req.body);
  const result = await adminKickMember(id, input.userId);
  res.status(200).json(result);
}
