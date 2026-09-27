import { Request, Response } from 'express';
import { eventIdParamSchema, eventListQuerySchema, eventPaginationSchema } from '../validation/event.schema';
import * as events from '../services/event.service';

export async function listEvents(req: Request, res: Response): Promise<void> { res.json(await events.listEvents(req.user!.id, eventListQuerySchema.parse(req.query))); }
export async function getEvent(req: Request, res: Response): Promise<void> { const { id } = eventIdParamSchema.parse(req.params); res.json(await events.getEvent(req.user!.id, id)); }
export async function getEventChallenges(req: Request, res: Response): Promise<void> { const { id } = eventIdParamSchema.parse(req.params); res.json({ challenges: await events.getEventChallenges(id, req.user!.id) }); }
export async function getEventLeaderboard(req: Request, res: Response): Promise<void> { const { id } = eventIdParamSchema.parse(req.params); const q = eventPaginationSchema.parse(req.query); res.json(await events.getEventLeaderboard(id, req.user!.id, q.limit, q.offset)); }
export async function getEventAnnouncements(req: Request, res: Response): Promise<void> { const { id } = eventIdParamSchema.parse(req.params); await events.getEventChallenges(id, req.user!.id); res.json({ announcements: await events.listAnnouncements(id) }); }
export async function getEventStats(req: Request, res: Response): Promise<void> { const { id } = eventIdParamSchema.parse(req.params); const event = await events.getEvent(req.user!.id, id); if (!event.registered && event.event.registrationRequired) { res.status(403).json({ error: { message: 'Event registration is required.', code: 'EVENT_REGISTRATION_REQUIRED' } }); return; } res.json({ stats: await events.getEventStats(id) }); }
export async function registerEvent(req: Request, res: Response): Promise<void> { const { id } = eventIdParamSchema.parse(req.params); res.status(201).json(await events.registerForEvent(req.user!.id, id)); }
export async function unregisterEvent(req: Request, res: Response): Promise<void> { const { id } = eventIdParamSchema.parse(req.params); res.json(await events.unregisterFromEvent(req.user!.id, id)); }
export async function getMyProgress(req: Request, res: Response): Promise<void> { const { id } = eventIdParamSchema.parse(req.params); res.json({ progress: await events.getMyProgress(req.user!.id, id) }); }
