import { z } from 'zod';

const uuid = z.string().uuid('Invalid ID.');

/** POST /api/teams — name length 3..80 per the team contract. */
export const teamCreateSchema = z.object({
  name: z.string().trim().min(3).max(80).refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value), 'Control characters are not allowed'),
});

/**
 * POST /api/teams/join — invite codes are 12 chars from the service's
 * unambiguous alphabet; the regex keeps malformed input from reaching the
 * database lookup, while an unknown-but-well-formed code stays a generic
 * 404 so codes cannot be enumerated.
 */
export const teamJoinSchema = z.object({
  inviteCode: z.string().trim().min(6).max(16).regex(/^[A-Za-z0-9]+$/, 'Invite code may contain only letters and numbers.'),
});

export const teamIdParamSchema = z.object({ id: uuid });

/** Kick / transfer / member-targeted actions. */
export const memberTargetSchema = z.object({ userId: uuid });

export const teamListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

/** Admin team create is not exposed — admins transfer/kick/dissolve only. */
export const adminTeamTransferSchema = memberTargetSchema;
export const adminTeamKickSchema = memberTargetSchema;

export type TeamCreateInput = z.infer<typeof teamCreateSchema>;
export type TeamJoinInput = z.infer<typeof teamJoinSchema>;
export type TeamListQuery = z.infer<typeof teamListQuerySchema>;
export type MemberTargetInput = z.infer<typeof memberTargetSchema>;
