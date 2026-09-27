import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import { ChallengeStatus } from '../constants/enums';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { HintCreateInput, HintUpdateInput, FileUpdateInput, WriteupCreateInput, WriteupUpdateInput } from '../validation/phase7.schema';

const STORAGE_ROOT = path.resolve(__dirname, '../../..', 'storage', 'challenge-files');
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.txt', '.md', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.zip', '.tar', '.gz', '.pcap', '.pcapng', '.bin']);
const ALLOWED_MIME_TYPES = new Set([
  'text/plain', 'text/markdown', 'application/pdf', 'image/png', 'image/jpeg', 'image/gif',
  'application/zip', 'application/x-zip-compressed', 'application/gzip', 'application/x-gzip',
  'application/x-tar', 'application/vnd.tcpdump.pcap', 'application/octet-stream',
]);

export interface UploadedFileInput {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

function safeOriginalName(value: string): string {
  const base = path.basename(value).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const normalized = base.replace(/[^A-Za-z0-9._()\- ]/g, '_').replace(/\s+/g, ' ');
  if (!normalized || normalized === '.' || normalized === '..') throw new ApiError(400, 'Invalid file name.', 'INVALID_FILE_NAME');
  return normalized.slice(0, 255);
}

function validateUpload(file: UploadedFileInput): string {
  if (!file || !Buffer.isBuffer(file.buffer)) throw new ApiError(400, 'A file is required.', 'FILE_REQUIRED');
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) throw new ApiError(413, 'File must be between 1 byte and 10 MB.', 'FILE_TOO_LARGE');
  const originalName = safeOriginalName(file.originalname);
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) throw new ApiError(400, 'This file type is not allowed.', 'FILE_TYPE_NOT_ALLOWED');
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) throw new ApiError(400, 'This MIME type is not allowed.', 'FILE_MIME_NOT_ALLOWED');
  if (ext === '.pdf' && file.mimetype === 'application/pdf' && !file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new ApiError(400, 'The uploaded PDF signature is invalid.', 'FILE_CONTENT_INVALID');
  if (ext === '.png' && file.mimetype === 'image/png' && !file.buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new ApiError(400, 'The uploaded PNG signature is invalid.', 'FILE_CONTENT_INVALID');
  if ((ext === '.jpg' || ext === '.jpeg') && file.mimetype === 'image/jpeg' && !(file.buffer[0] === 0xff && file.buffer[1] === 0xd8)) throw new ApiError(400, 'The uploaded JPEG signature is invalid.', 'FILE_CONTENT_INVALID');
  if (ext === '.gif' && file.mimetype === 'image/gif' && !Buffer.from(file.buffer.subarray(0, 6)).toString('ascii').match(/^GIF8[79]a$/)) throw new ApiError(400, 'The uploaded GIF signature is invalid.', 'FILE_CONTENT_INVALID');
  if (ext === '.zip' && (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed') && !(file.buffer[0] === 0x50 && file.buffer[1] === 0x4b)) throw new ApiError(400, 'The uploaded ZIP signature is invalid.', 'FILE_CONTENT_INVALID');
  return ext;
}

async function ensureStorage(): Promise<void> {
  await fs.mkdir(STORAGE_ROOT, { recursive: true });
}

function publicFile(row: { id: string; originalName: string; mimeType: string; sizeBytes: number; isEnabled: boolean; createdAt: Date; updatedAt: Date }) {
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    isEnabled: row.isEnabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function requireUserChallengeAccess(challengeId: string, userId: string, options: { allowArchivedSolved?: boolean } = {}) {
  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    select: {
      id: true,
      status: true,
      prerequisiteId: true,
      solves: { where: { userId }, select: { userId: true }, take: 1 },
      prerequisite: { select: { id: true, solves: { where: { userId }, select: { challengeId: true }, take: 1 } } },
    },
  });
  if (!challenge) throw new ApiError(404, 'Challenge not found', 'CHALLENGE_NOT_FOUND');
  if (challenge.status !== ChallengeStatus.PUBLISHED && !(options.allowArchivedSolved && challenge.status === ChallengeStatus.ARCHIVED && challenge.solves.length > 0)) {
    throw new ApiError(404, 'Challenge not found', 'CHALLENGE_NOT_FOUND');
  }
  // Prerequisite gate: hint listings, hint unlocks, and file links are all
  // withheld while the challenge is locked — the same CHALLENGE_LOCKED
  // contract the detail and submit endpoints use. Already solving this
  // challenge (e.g. before a prerequisite was attached) keeps access.
  if (
    challenge.prerequisiteId &&
    challenge.prerequisite &&
    challenge.prerequisite.solves.length === 0 &&
    challenge.solves.length === 0
  ) {
    throw new ApiError(403, 'Solve the prerequisite challenge first.', 'CHALLENGE_LOCKED');
  }
  return challenge;
}

async function requirePublishedChallenge(challengeId: string, userId: string) {
  return requireUserChallengeAccess(challengeId, userId);
}

async function requireAdminChallenge(challengeId: string) {
  const challenge = await prisma.challenge.findUnique({ where: { id: challengeId }, select: { id: true } });
  if (!challenge) throw new ApiError(404, 'Challenge not found', 'CHALLENGE_NOT_FOUND');
}

export async function listUserHints(challengeId: string, userId: string) {
  await requireUserChallengeAccess(challengeId, userId, { allowArchivedSolved: true });
  const [rows, earned, spent] = await Promise.all([
    prisma.hint.findMany({
      where: { challengeId, isEnabled: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, title: true, cost: true, sortOrder: true, unlocks: { where: { userId }, select: { unlockedAt: true, costPaid: true } } },
    }),
    prisma.solve.aggregate({ where: { userId }, _sum: { pointsAwarded: true } }),
    prisma.hintUnlock.aggregate({ where: { userId }, _sum: { costPaid: true } }),
  ]);
  const availablePoints = Math.max(0, (earned._sum.pointsAwarded ?? 0) - (spent._sum.costPaid ?? 0));
  const hints = rows.map((row) => ({
    id: row.id,
    title: row.title,
    cost: row.cost,
    sortOrder: row.sortOrder,
    unlocked: row.unlocks.length > 0,
    ...(row.unlocks.length > 0 ? { unlockedAt: row.unlocks[0].unlockedAt, costPaid: row.unlocks[0].costPaid } : {}),
  }));
  return { availablePoints, hints };
}

export async function unlockHint(challengeId: string, hintId: string, userId: string) {
  await requirePublishedChallenge(challengeId, userId);
  const hint = await prisma.hint.findFirst({ where: { id: hintId, challengeId, isEnabled: true }, select: { id: true, title: true, content: true, cost: true } });
  if (!hint) throw new ApiError(404, 'Hint not found', 'HINT_NOT_FOUND');

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.hintUnlock.findUnique({ where: { userId_hintId: { userId, hintId } }, select: { costPaid: true, unlockedAt: true } });
      if (existing) return { unlocked: true, alreadyUnlocked: true, costPaid: existing.costPaid, remainingPoints: await availablePoints(tx, userId), hint: { id: hint.id, title: hint.title, content: hint.content } };

      const balance = await availablePoints(tx, userId);
      if (balance < hint.cost) throw new ApiError(409, 'You do not have enough available points to unlock this hint.', 'INSUFFICIENT_HINT_POINTS');
      const unlock = await tx.hintUnlock.create({ data: { userId, hintId, costPaid: hint.cost }, select: { costPaid: true, unlockedAt: true } });
      return { unlocked: true, alreadyUnlocked: false, costPaid: unlock.costPaid, remainingPoints: balance - unlock.costPaid, hint: { id: hint.id, title: hint.title, content: hint.content } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      throw new ApiError(409, 'Hint unlock could not be completed safely. Please try again.', 'HINT_UNLOCK_RETRY');
    }
    throw err;
  }
}

async function availablePoints(tx: Prisma.TransactionClient, userId: string): Promise<number> {
  const [earned, spent] = await Promise.all([
    tx.solve.aggregate({ where: { userId }, _sum: { pointsAwarded: true } }),
    tx.hintUnlock.aggregate({ where: { userId }, _sum: { costPaid: true } }),
  ]);
  return Math.max(0, (earned._sum.pointsAwarded ?? 0) - (spent._sum.costPaid ?? 0));
}

export async function getUserWriteup(challengeId: string, userId: string) {
  const challenge = await prisma.challenge.findUnique({ where: { id: challengeId }, select: { id: true, status: true, solves: { where: { userId }, select: { userId: true }, take: 1 }, writeup: { select: { content: true, isPublished: true, updatedAt: true } } } });
  if (!challenge || (challenge.status !== ChallengeStatus.PUBLISHED && !(challenge.status === ChallengeStatus.ARCHIVED && challenge.solves.length > 0))) throw new ApiError(404, 'Challenge not found', 'CHALLENGE_NOT_FOUND');
  if (!challenge.writeup) throw new ApiError(404, 'Writeup not available', 'WRITEUP_NOT_FOUND');
  if (!challenge.writeup.isPublished || challenge.solves.length === 0) throw new ApiError(403, 'Solve this challenge to access its published writeup.', 'WRITEUP_LOCKED');
  return { content: challenge.writeup.content, updatedAt: challenge.writeup.updatedAt };
}

export async function listUserFiles(challengeId: string, userId: string) {
  await requireUserChallengeAccess(challengeId, userId, { allowArchivedSolved: true });
  const rows = await prisma.challengeFile.findMany({ where: { challengeId, isEnabled: true }, orderBy: { createdAt: 'asc' }, select: { id: true, originalName: true, mimeType: true, sizeBytes: true, isEnabled: true, createdAt: true, updatedAt: true } });
  return rows.map(publicFile);
}

export async function getUserFile(challengeId: string, fileId: string, userId: string) {
  await requireUserChallengeAccess(challengeId, userId, { allowArchivedSolved: true });
  const row = await prisma.challengeFile.findFirst({ where: { id: fileId, challengeId, isEnabled: true }, select: { id: true, originalName: true, mimeType: true, sizeBytes: true, isEnabled: true, storageName: true, createdAt: true, updatedAt: true } });
  if (!row) throw new ApiError(404, 'File not found', 'FILE_NOT_FOUND');
  const storagePath = path.resolve(STORAGE_ROOT, row.storageName);
  if (path.dirname(storagePath) !== STORAGE_ROOT) throw new ApiError(500, 'Stored file path is invalid.', 'INVALID_STORAGE_PATH');
  return { ...publicFile(row), storagePath };
}

export async function listAdminHints(challengeId: string) {
  await requireAdminChallenge(challengeId);
  return prisma.hint.findMany({ where: { challengeId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, title: true, content: true, cost: true, sortOrder: true, isEnabled: true, createdAt: true, updatedAt: true } });
}

export async function createAdminHint(challengeId: string, input: HintCreateInput) {
  await requireAdminChallenge(challengeId);
  return prisma.hint.create({ data: { challengeId, ...input }, select: { id: true, title: true, content: true, cost: true, sortOrder: true, isEnabled: true, createdAt: true, updatedAt: true } });
}

export async function updateAdminHint(challengeId: string, hintId: string, input: HintUpdateInput) {
  await requireAdminChallenge(challengeId);
  const hint = await prisma.hint.findFirst({ where: { id: hintId, challengeId }, select: { id: true } });
  if (!hint) throw new ApiError(404, 'Hint not found', 'HINT_NOT_FOUND');
  return prisma.hint.update({ where: { id: hintId }, data: input, select: { id: true, title: true, content: true, cost: true, sortOrder: true, isEnabled: true, createdAt: true, updatedAt: true } });
}

export async function deleteAdminHint(challengeId: string, hintId: string) {
  await requireAdminChallenge(challengeId);
  const hint = await prisma.hint.findFirst({ where: { id: hintId, challengeId }, select: { id: true } });
  if (!hint) throw new ApiError(404, 'Hint not found', 'HINT_NOT_FOUND');
  await prisma.hint.delete({ where: { id: hintId } });
  return { deleted: true };
}

export async function listAdminFiles(challengeId: string) {
  await requireAdminChallenge(challengeId);
  return prisma.challengeFile.findMany({ where: { challengeId }, orderBy: { createdAt: 'asc' }, select: { id: true, originalName: true, mimeType: true, sizeBytes: true, isEnabled: true, createdAt: true, updatedAt: true } }).then((rows) => rows.map(publicFile));
}

export async function createAdminFile(challengeId: string, file: UploadedFileInput) {
  await requireAdminChallenge(challengeId);
  const ext = validateUpload(file);
  const originalName = safeOriginalName(file.originalname);
  await ensureStorage();
  const storageName = `${randomUUID()}${ext}`;
  const storagePath = path.resolve(STORAGE_ROOT, storageName);
  if (path.dirname(storagePath) !== STORAGE_ROOT) throw new ApiError(500, 'Storage path validation failed.', 'INVALID_STORAGE_PATH');
  await fs.writeFile(storagePath, file.buffer, { flag: 'wx' });
  try {
    const row = await prisma.challengeFile.create({ data: { challengeId, originalName, storageName, mimeType: file.mimetype, sizeBytes: file.size }, select: { id: true, originalName: true, mimeType: true, sizeBytes: true, isEnabled: true, createdAt: true, updatedAt: true } });
    return publicFile(row);
  } catch (err) {
    await fs.rm(storagePath, { force: true });
    throw err;
  }
}

export async function updateAdminFile(challengeId: string, fileId: string, input: FileUpdateInput) {
  await requireAdminChallenge(challengeId);
  const existing = await prisma.challengeFile.findFirst({ where: { id: fileId, challengeId }, select: { id: true } });
  if (!existing) throw new ApiError(404, 'File not found', 'FILE_NOT_FOUND');
  const data: Prisma.ChallengeFileUpdateInput = {};
  if (input.originalName !== undefined) {
    const renamed = safeOriginalName(input.originalName);
    const ext = path.extname(renamed).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) throw new ApiError(400, 'This file type is not allowed.', 'FILE_TYPE_NOT_ALLOWED');
    data.originalName = renamed;
  }
  if (input.isEnabled !== undefined) data.isEnabled = input.isEnabled;
  const row = await prisma.challengeFile.update({ where: { id: fileId }, data, select: { id: true, originalName: true, mimeType: true, sizeBytes: true, isEnabled: true, createdAt: true, updatedAt: true } });
  return publicFile(row);
}

export async function deleteAdminFile(challengeId: string, fileId: string) {
  await requireAdminChallenge(challengeId);
  const row = await prisma.challengeFile.findFirst({ where: { id: fileId, challengeId }, select: { id: true, storageName: true } });
  if (!row) throw new ApiError(404, 'File not found', 'FILE_NOT_FOUND');
  await prisma.challengeFile.delete({ where: { id: fileId } });
  const storagePath = path.resolve(STORAGE_ROOT, row.storageName);
  if (path.dirname(storagePath) === STORAGE_ROOT) await fs.rm(storagePath, { force: true });
  return { deleted: true };
}

export async function getAdminWriteup(challengeId: string) {
  await requireAdminChallenge(challengeId);
  const row = await prisma.writeup.findUnique({ where: { challengeId }, select: { id: true, challengeId: true, content: true, isPublished: true, createdAt: true, updatedAt: true } });
  return row;
}

export async function upsertAdminWriteup(challengeId: string, input: WriteupCreateInput) {
  await requireAdminChallenge(challengeId);
  return prisma.writeup.upsert({ where: { challengeId }, create: { challengeId, ...input }, update: input, select: { id: true, challengeId: true, content: true, isPublished: true, createdAt: true, updatedAt: true } });
}

export async function updateAdminWriteup(challengeId: string, input: WriteupUpdateInput) {
  await requireAdminChallenge(challengeId);
  const existing = await prisma.writeup.findUnique({ where: { challengeId }, select: { id: true } });
  if (!existing) throw new ApiError(404, 'Writeup not found', 'WRITEUP_NOT_FOUND');
  return prisma.writeup.update({ where: { challengeId }, data: input, select: { id: true, challengeId: true, content: true, isPublished: true, createdAt: true, updatedAt: true } });
}

export async function deleteAdminWriteup(challengeId: string) {
  await requireAdminChallenge(challengeId);
  const existing = await prisma.writeup.findUnique({ where: { challengeId }, select: { id: true } });
  if (!existing) throw new ApiError(404, 'Writeup not found', 'WRITEUP_NOT_FOUND');
  await prisma.writeup.delete({ where: { challengeId } });
  return { deleted: true };
}
