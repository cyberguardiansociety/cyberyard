import { Request, Response } from 'express';
import { badgeIdParamSchema, badgeCreateSchema, badgeUpdateSchema } from '../validation/phase8.schema';
import { createAdminBadge, deleteAdminBadge, getBadge, listAdminBadges, listBadges, listUserBadges, updateAdminBadge } from '../services/badge.service';
export async function getBadges(req: Request, res: Response) { res.json({ badges: await listBadges(req.user!.id) }); }
export async function getBadgeById(req: Request, res: Response) { const { id } = badgeIdParamSchema.parse(req.params); res.json({ badge: await getBadge(id, req.user!.id) }); }
export async function getMyBadges(req: Request, res: Response) { res.json({ badges: await listUserBadges(req.user!.id) }); }
export async function getAdminBadges(_req: Request, res: Response) { res.json({ badges: await listAdminBadges() }); }
export async function postAdminBadge(req: Request, res: Response) { res.status(201).json({ badge: await createAdminBadge(badgeCreateSchema.parse(req.body)) }); }
export async function patchAdminBadge(req: Request, res: Response) { const { id } = badgeIdParamSchema.parse(req.params); res.json({ badge: await updateAdminBadge(id, badgeUpdateSchema.parse(req.body)) }); }
export async function deleteAdminBadgeById(req: Request, res: Response) { const { id } = badgeIdParamSchema.parse(req.params); res.json(await deleteAdminBadge(id)); }
