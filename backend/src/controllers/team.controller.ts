import { Request, Response } from 'express';
import {
  teamCreateSchema,
  teamJoinSchema,
  teamIdParamSchema,
  teamListQuerySchema,
  memberTargetSchema,
} from '../validation/teams.schema';
import {
  createTeam,
  joinTeam,
  leaveTeam,
  kickMember,
  regenerateInviteCode,
  dissolveOwnTeam,
  getMyTeam,
  getTeamProfile,
  listTeams,
  getTeamLeaderboard,
} from '../services/team.service';

/** POST /api/teams — { name } → 201 { team }. */
export async function postCreateTeam(req: Request, res: Response): Promise<void> {
  const input = teamCreateSchema.parse(req.body);
  const team = await createTeam(req.user!.id, input.name);
  res.status(201).json({ team });
}

/** POST /api/teams/join — { inviteCode } → { team }. */
export async function postJoinTeam(req: Request, res: Response): Promise<void> {
  const input = teamJoinSchema.parse(req.body);
  const team = await joinTeam(req.user!.id, input.inviteCode);
  res.status(200).json({ team });
}

/** POST /api/teams/leave → { left: true, dissolved }. */
export async function postLeaveTeam(req: Request, res: Response): Promise<void> {
  const result = await leaveTeam(req.user!.id);
  res.status(200).json(result);
}

/** POST /api/teams/kick — { userId } → { kicked: true, userId }. */
export async function postKickMember(req: Request, res: Response): Promise<void> {
  const input = memberTargetSchema.parse(req.body);
  const result = await kickMember(req.user!.id, input.userId);
  res.status(200).json(result);
}

/** POST /api/teams/regenerate-code → { inviteCode } (captain only). */
export async function postRegenerateCode(req: Request, res: Response): Promise<void> {
  const result = await regenerateInviteCode(req.user!.id);
  res.status(200).json(result);
}

/** POST /api/teams/dissolve → { dissolved: true } (captain only). */
export async function postDissolveTeam(req: Request, res: Response): Promise<void> {
  const result = await dissolveOwnTeam(req.user!.id);
  res.status(200).json(result);
}

/** GET /api/teams/mine → { team } — includes members, combined score, rank. */
export async function getMyTeamController(req: Request, res: Response): Promise<void> {
  const team = await getMyTeam(req.user!.id);
  res.status(200).json({ team });
}

/** GET /api/teams/:id → { team } — public safe-field profile (no invite code). */
export async function getTeamByIdController(req: Request, res: Response): Promise<void> {
  const { id } = teamIdParamSchema.parse(req.params);
  const team = await getTeamProfile(id);
  res.status(200).json({ team });
}

/** GET /api/teams?limit=&offset= → { teams, total, limit, offset }. */
export async function listTeamsController(req: Request, res: Response): Promise<void> {
  const query = teamListQuerySchema.parse(req.query);
  res.status(200).json(await listTeams(query));
}

/** GET /api/teams/leaderboard?limit=&offset= → { leaderboard, total, limit, offset }. */
export async function getTeamLeaderboardController(req: Request, res: Response): Promise<void> {
  const query = teamListQuerySchema.parse(req.query);
  res.status(200).json(await getTeamLeaderboard(query));
}
