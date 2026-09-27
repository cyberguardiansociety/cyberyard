import { Request, Response } from 'express';
import {
  adminChallengeCreateSchema,
  adminChallengeUpdateSchema,
  adminChallengeListQuerySchema,
  adminChallengeIdParamSchema,
  adminCategoryCreateSchema,
  adminCategoryUpdateSchema,
  adminCategoryIdParamSchema,
  adminDifficultyCreateSchema,
  adminDifficultyUpdateSchema,
  adminDifficultyIdParamSchema,
} from '../validation/admin.schema';
import {
  getAdminOverview,
  listAdminChallenges,
  getAdminChallenge,
  createAdminChallenge,
  updateAdminChallenge,
  deleteAdminChallenge,
  publishAdminChallenge,
  unpublishAdminChallenge,
  archiveAdminChallenge,
  listAdminCategories,
  createAdminCategory,
  updateAdminCategory,
  deleteAdminCategory,
  listAdminDifficulties,
  createAdminDifficulty,
  updateAdminDifficulty,
  deleteAdminDifficulty,
} from '../services/admin.service';

export async function getAdminOverviewStats(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ overview: await getAdminOverview() });
}

export async function getAdminChallenges(req: Request, res: Response): Promise<void> {
  const query = adminChallengeListQuerySchema.parse(req.query);
  res.status(200).json(await listAdminChallenges(query));
}

export async function getAdminChallengeById(req: Request, res: Response): Promise<void> {
  const { id } = adminChallengeIdParamSchema.parse(req.params);
  res.status(200).json({ challenge: await getAdminChallenge(id) });
}

export async function postAdminChallenge(req: Request, res: Response): Promise<void> {
  const input = adminChallengeCreateSchema.parse(req.body);
  res.status(201).json({ challenge: await createAdminChallenge(input, req.user!.id) });
}

export async function patchAdminChallenge(req: Request, res: Response): Promise<void> {
  const { id } = adminChallengeIdParamSchema.parse(req.params);
  const input = adminChallengeUpdateSchema.parse(req.body);
  res.status(200).json({ challenge: await updateAdminChallenge(id, input) });
}

export async function postPublishAdminChallenge(req: Request, res: Response): Promise<void> {
  const { id } = adminChallengeIdParamSchema.parse(req.params);
  res.status(200).json({ challenge: await publishAdminChallenge(id) });
}

export async function postUnpublishAdminChallenge(req: Request, res: Response): Promise<void> {
  const { id } = adminChallengeIdParamSchema.parse(req.params);
  res.status(200).json({ challenge: await unpublishAdminChallenge(id) });
}

export async function postArchiveAdminChallenge(req: Request, res: Response): Promise<void> {
  const { id } = adminChallengeIdParamSchema.parse(req.params);
  res.status(200).json({ challenge: await archiveAdminChallenge(id) });
}

export async function deleteAdminChallengeById(req: Request, res: Response): Promise<void> {
  const { id } = adminChallengeIdParamSchema.parse(req.params);
  res.status(200).json(await deleteAdminChallenge(id));
}

export async function getAdminCategories(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ categories: await listAdminCategories() });
}

export async function postAdminCategory(req: Request, res: Response): Promise<void> {
  const input = adminCategoryCreateSchema.parse(req.body);
  res.status(201).json({ category: await createAdminCategory(input) });
}

export async function patchAdminCategory(req: Request, res: Response): Promise<void> {
  const { id } = adminCategoryIdParamSchema.parse(req.params);
  const input = adminCategoryUpdateSchema.parse(req.body);
  res.status(200).json({ category: await updateAdminCategory(id, input) });
}

export async function deleteAdminCategoryById(req: Request, res: Response): Promise<void> {
  const { id } = adminCategoryIdParamSchema.parse(req.params);
  res.status(200).json(await deleteAdminCategory(id));
}

export async function getAdminDifficulties(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ difficulties: await listAdminDifficulties() });
}

export async function postAdminDifficulty(req: Request, res: Response): Promise<void> {
  const input = adminDifficultyCreateSchema.parse(req.body);
  res.status(201).json({ difficulty: await createAdminDifficulty(input) });
}

export async function patchAdminDifficulty(req: Request, res: Response): Promise<void> {
  const { id } = adminDifficultyIdParamSchema.parse(req.params);
  const input = adminDifficultyUpdateSchema.parse(req.body);
  res.status(200).json({ difficulty: await updateAdminDifficulty(id, input) });
}

export async function deleteAdminDifficultyById(req: Request, res: Response): Promise<void> {
  const { id } = adminDifficultyIdParamSchema.parse(req.params);
  res.status(200).json(await deleteAdminDifficulty(id));
}
