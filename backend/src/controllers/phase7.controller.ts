import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import {
  challengeIdParamSchema, hintIdParamSchema, fileIdParamSchema,
  hintCreateSchema, hintUpdateSchema, fileUpdateSchema, writeupCreateSchema, writeupUpdateSchema,
} from '../validation/phase7.schema';
import {
  listUserHints, unlockHint, listUserFiles, getUserFile, getUserWriteup,
  listAdminHints, createAdminHint, updateAdminHint, deleteAdminHint,
  listAdminFiles, createAdminFile, updateAdminFile, deleteAdminFile,
  getAdminWriteup, upsertAdminWriteup, updateAdminWriteup, deleteAdminWriteup,
} from '../services/phase7.service';
import { ApiError } from '../utils/ApiError';

export async function getChallengeHints(req: Request, res: Response): Promise<void> {
  const { id } = challengeIdParamSchema.parse(req.params);
  res.status(200).json({ hints: await listUserHints(id, req.user!.id) });
}

export async function postUnlockHint(req: Request, res: Response): Promise<void> {
  const { id, hintId } = hintIdParamSchema.parse(req.params);
  res.status(200).json(await unlockHint(id, hintId, req.user!.id));
}

export async function getChallengeFiles(req: Request, res: Response): Promise<void> {
  const { id } = challengeIdParamSchema.parse(req.params);
  res.status(200).json({ files: await listUserFiles(id, req.user!.id) });
}

export async function downloadChallengeFile(req: Request, res: Response): Promise<void> {
  const { id, fileId } = fileIdParamSchema.parse(req.params);
  const file = await getUserFile(id, fileId, req.user!.id);
  try {
    await fs.access(file.storagePath);
  } catch {
    throw new ApiError(404, 'File not found', 'FILE_NOT_FOUND');
  }
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Length', String(file.sizeBytes));
  res.setHeader('Content-Disposition', `attachment; filename="${file.originalName.replace(/"/g, '')}"`);
  res.sendFile(file.storagePath);
}

export async function getChallengeWriteup(req: Request, res: Response): Promise<void> {
  const { id } = challengeIdParamSchema.parse(req.params);
  res.status(200).json({ writeup: await getUserWriteup(id, req.user!.id) });
}

export async function getAdminChallengeHints(req: Request, res: Response): Promise<void> {
  const { id } = challengeIdParamSchema.parse(req.params);
  res.status(200).json({ hints: await listAdminHints(id) });
}

export async function postAdminChallengeHint(req: Request, res: Response): Promise<void> {
  const { id } = challengeIdParamSchema.parse(req.params);
  res.status(201).json({ hint: await createAdminHint(id, hintCreateSchema.parse(req.body)) });
}

export async function patchAdminChallengeHint(req: Request, res: Response): Promise<void> {
  const { id, hintId } = hintIdParamSchema.parse(req.params);
  res.status(200).json({ hint: await updateAdminHint(id, hintId, hintUpdateSchema.parse(req.body)) });
}

export async function deleteAdminChallengeHint(req: Request, res: Response): Promise<void> {
  const { id, hintId } = hintIdParamSchema.parse(req.params);
  res.status(200).json(await deleteAdminHint(id, hintId));
}

export async function getAdminChallengeFiles(req: Request, res: Response): Promise<void> {
  const { id } = challengeIdParamSchema.parse(req.params);
  res.status(200).json({ files: await listAdminFiles(id) });
}

export async function postAdminChallengeFile(req: Request, res: Response): Promise<void> {
  const { id } = challengeIdParamSchema.parse(req.params);
  if (!req.file) throw new ApiError(400, 'A file is required.', 'FILE_REQUIRED');
  const file = req.file;
  res.status(201).json({ file: await createAdminFile(id, { originalname: file.originalname, mimetype: file.mimetype, size: file.size, buffer: file.buffer }) });
}

export async function patchAdminChallengeFile(req: Request, res: Response): Promise<void> {
  const { id, fileId } = fileIdParamSchema.parse(req.params);
  res.status(200).json({ file: await updateAdminFile(id, fileId, fileUpdateSchema.parse(req.body)) });
}

export async function deleteAdminChallengeFile(req: Request, res: Response): Promise<void> {
  const { id, fileId } = fileIdParamSchema.parse(req.params);
  res.status(200).json(await deleteAdminFile(id, fileId));
}

export async function getAdminChallengeWriteup(req: Request, res: Response): Promise<void> {
  const { id } = challengeIdParamSchema.parse(req.params);
  res.status(200).json({ writeup: await getAdminWriteup(id) });
}

export async function postAdminChallengeWriteup(req: Request, res: Response): Promise<void> {
  const { id } = challengeIdParamSchema.parse(req.params);
  res.status(200).json({ writeup: await upsertAdminWriteup(id, writeupCreateSchema.parse(req.body)) });
}

export async function patchAdminChallengeWriteup(req: Request, res: Response): Promise<void> {
  const { id } = challengeIdParamSchema.parse(req.params);
  res.status(200).json({ writeup: await updateAdminWriteup(id, writeupUpdateSchema.parse(req.body)) });
}

export async function deleteAdminChallengeWriteup(req: Request, res: Response): Promise<void> {
  const { id } = challengeIdParamSchema.parse(req.params);
  res.status(200).json(await deleteAdminWriteup(id));
}
