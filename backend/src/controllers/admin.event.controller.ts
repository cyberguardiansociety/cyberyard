import { Request, Response } from 'express';
import { EventStatus } from '../constants/enums';
import { z } from 'zod';
import { eventAnnouncementParamSchema, eventChallengeCreateSchema, eventChallengeOrderSchema, eventChallengeParamSchema, eventIdParamSchema, eventParticipantQuerySchema, adminEventCreateSchema, adminEventUpdateSchema, eventAnnouncementCreateSchema, eventAnnouncementUpdateSchema } from '../validation/event.schema';
import * as events from '../services/event.service';

const adminEventListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(['DRAFT','UPCOMING','LIVE','ENDED','ARCHIVED']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export async function listAdminEvents(req: Request, res: Response): Promise<void> { const q = adminEventListQuerySchema.parse(req.query); res.json(await events.listAdminEvents({ search: q.search, status: q.status as EventStatus | undefined, limit: q.limit, offset: q.offset })); }
export async function getAdminEvent(req: Request, res: Response): Promise<void> { const { id } = eventIdParamSchema.parse(req.params); res.json(await events.getAdminEvent(id)); }
export async function createAdminEvent(req: Request, res: Response): Promise<void> { res.status(201).json({ event: await events.createEvent(adminEventCreateSchema.parse(req.body), req.user!.id) }); }
export async function updateAdminEvent(req: Request, res: Response): Promise<void> { const { id } = eventIdParamSchema.parse(req.params); res.json({ event: await events.updateEvent(id, req.user!.id, adminEventUpdateSchema.parse(req.body)) }); }
export async function publishAdminEvent(req: Request, res: Response): Promise<void> { const { id } = eventIdParamSchema.parse(req.params); res.json({ event: await events.publishEvent(id, req.user!.id) }); }
export async function archiveAdminEvent(req: Request, res: Response): Promise<void> { const { id } = eventIdParamSchema.parse(req.params); res.json({ event: await events.archiveEvent(id, req.user!.id) }); }
export async function deleteAdminEvent(req: Request, res: Response): Promise<void> { const { id } = eventIdParamSchema.parse(req.params); res.json(await events.deleteEvent(id, req.user!.id)); }
export async function addChallenge(req: Request, res: Response): Promise<void> { const { id } = eventIdParamSchema.parse(req.params); res.status(201).json({ challenge: await events.addEventChallenge(id, req.user!.id, eventChallengeCreateSchema.parse(req.body)) }); }
export async function removeChallenge(req: Request, res: Response): Promise<void> { const { id, challengeId } = eventChallengeParamSchema.parse(req.params); res.json(await events.removeEventChallenge(id, req.user!.id, challengeId)); }
export async function reorderChallenges(req: Request, res: Response): Promise<void> { const { id } = eventIdParamSchema.parse(req.params); res.json(await events.reorderEventChallenges(id, req.user!.id, eventChallengeOrderSchema.parse(req.body).items)); }
export async function createAnnouncement(req: Request, res: Response): Promise<void> { const { id } = eventIdParamSchema.parse(req.params); res.status(201).json({ announcement: await events.createAnnouncement(id, req.user!.id, eventAnnouncementCreateSchema.parse(req.body)) }); }
export async function updateAnnouncement(req: Request, res: Response): Promise<void> { const { id, announcementId } = eventAnnouncementParamSchema.parse(req.params); res.json({ announcement: await events.updateAnnouncement(id, req.user!.id, announcementId, eventAnnouncementUpdateSchema.parse(req.body)) }); }
export async function deleteAnnouncement(req: Request, res: Response): Promise<void> { const { id, announcementId } = eventAnnouncementParamSchema.parse(req.params); res.json(await events.deleteAnnouncement(id, req.user!.id, announcementId)); }
export async function participants(req: Request, res: Response): Promise<void> { const { id } = eventIdParamSchema.parse(req.params); const q = eventParticipantQuerySchema.parse(req.query); res.json(await events.listParticipants(id, q.limit, q.offset)); }
export async function removeParticipant(req: Request, res: Response): Promise<void> { const { id, registrationId } = eventIdParamSchema.extend({ registrationId: eventIdParamSchema.shape.id }).parse(req.params); res.json(await events.removeParticipant(id, req.user!.id, registrationId)); }
export async function stats(req: Request, res: Response): Promise<void> { const { id } = eventIdParamSchema.parse(req.params); res.json({ stats: await events.getEventStats(id) }); }
