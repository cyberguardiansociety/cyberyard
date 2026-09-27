import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { UserActivityType } from '../constants/enums';

export type ActivityDb = Prisma.TransactionClient | typeof prisma;
type ActivityMetadataValue = string | number | boolean | null;
type ActivityMetadata = Record<string, ActivityMetadataValue>;

export interface CreateActivityInput {
  userId: string;
  type: UserActivityType;
  description: string;
  targetId?: string | null;
  targetType?: string | null;
  /** Callers pass an object; strings are accepted for defensive DB/input handling. */
  metadata?: ActivityMetadata | string | null;
}

const activitySelect = {
  id: true,
  type: true,
  description: true,
  targetId: true,
  targetType: true,
  metadata: true,
  createdAt: true,
} satisfies Prisma.UserActivitySelect;

function parseMetadata(value: unknown): Record<string, unknown> | null {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

function sanitizeMetadata(metadata: unknown): ActivityMetadata | undefined {
  const source = parseMetadata(metadata);
  if (!source) return undefined;
  const entries = Object.entries(source).slice(0, 8).map(([key, value]) => {
    const safeKey = key.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 40);
    if (typeof value === 'string') return [safeKey, value.slice(0, 200)] as const;
    if (typeof value === 'number' && Number.isFinite(value)) return [safeKey, value] as const;
    if (typeof value === 'boolean' || value === null) return [safeKey, value] as const;
    return null;
  }).filter((entry): entry is readonly [string, ActivityMetadataValue] => entry !== null);
  return Object.fromEntries(entries);
}

function serializeMetadata(metadata: CreateActivityInput['metadata']): string | undefined {
  const sanitized = sanitizeMetadata(metadata);
  if (!sanitized) return undefined;
  try {
    return JSON.stringify(sanitized) ?? undefined;
  } catch {
    return undefined;
  }
}

function parseStoredMetadata(metadata: unknown): ActivityMetadata | null {
  return sanitizeMetadata(metadata) ?? null;
}

export async function createActivity(db: ActivityDb, input: CreateActivityInput) {
  const metadata = serializeMetadata(input.metadata);
  const created = await db.userActivity.create({
    data: {
      userId: input.userId,
      type: input.type,
      description: input.description.slice(0, 500),
      targetId: input.targetId ?? null,
      targetType: input.targetType?.slice(0, 64) ?? null,
      ...(metadata !== undefined ? { metadata } : {}),
    },
    select: activitySelect,
  });
  return { ...created, type: created.type as UserActivityType, metadata: parseStoredMetadata(created.metadata) };
}

export async function listActivity(userId: string, options: { limit: number; offset: number }) {
  const where = { userId };
  const [activities, total] = await prisma.$transaction([
    prisma.userActivity.findMany({
      where,
      select: activitySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.limit,
      skip: options.offset,
    }),
    prisma.userActivity.count({ where }),
  ]);
  return {
    activities: activities.map((activity) => ({
      ...activity,
      type: activity.type as UserActivityType,
      metadata: parseStoredMetadata(activity.metadata),
    })),
    total,
    limit: options.limit,
    offset: options.offset,
  };
}

export async function recordActivity(input: CreateActivityInput): Promise<void> {
  try {
    await createActivity(prisma, input);
  } catch {
    logger.error('User activity write failed', { type: input.type, userId: input.userId });
  }
}
