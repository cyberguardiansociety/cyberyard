import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { NotificationType } from '../constants/enums';

export type NotificationDb = Prisma.TransactionClient | typeof prisma;

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  targetId?: string | null;
  dedupeKey?: string | null;
}

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  message: true,
  link: true,
  targetId: true,
  readAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.NotificationSelect;

export async function createNotification(db: NotificationDb, input: CreateNotificationInput) {
  try {
    return await db.notification.create({ data: input, select: notificationSelect });
  } catch (error) {
    if (input.dedupeKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return null;
    }
    throw error;
  }
}

export async function createNotifications(db: NotificationDb, inputs: CreateNotificationInput[]): Promise<number> {
  if (!inputs.length) return 0;
  // Prisma's SQLite connector does not implement createMany({ skipDuplicates })
  // (it is PostgreSQL-only), so the dedupe is handled per row by
  // createNotification, which already swallows the unique-constraint error
  // for inputs carrying a dedupeKey. Runs on the caller's transaction
  // client, so the whole batch stays atomic with its caller.
  let created = 0;
  for (const input of inputs) {
    if (await createNotification(db, input)) created += 1;
  }
  return created;
}

export async function notifyChallengePublished(db: NotificationDb, challenge: { id: string; title: string; publishedAt?: Date | null }): Promise<number> {
  const users = await db.user.findMany({
    where: {
      OR: [
        { settings: { is: { notifyChallengeUpdates: true } } },
        { settings: { is: null } },
      ],
    },
    select: { id: true },
  });

  return createNotifications(db, users.map(({ id: userId }) => ({
    userId,
    type: NotificationType.CHALLENGE_PUBLISHED,
    title: 'New challenge published',
    message: `“${challenge.title}” is now live.`,
    link: `/challenges/${challenge.id}`,
    targetId: challenge.id,
    dedupeKey: `challenge-published:${challenge.id}:${challenge.publishedAt?.getTime() ?? 'unknown'}:${userId}`,
  })));
}

export async function listNotifications(userId: string, options: { limit: number; offset: number; read?: 'all' | 'unread' | 'read' }) {
  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(options.read === 'unread' ? { readAt: null } : {}),
    ...(options.read === 'read' ? { readAt: { not: null } } : {}),
  };

  const [notifications, total, unread] = await prisma.$transaction([
    prisma.notification.findMany({
      where,
      select: notificationSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.limit,
      skip: options.offset,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  return { notifications, total, unread, limit: options.limit, offset: options.offset };
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
  if (!result.count) {
    const exists = await prisma.notification.findFirst({ where: { id: notificationId, userId }, select: { id: true } });
    if (!exists) throw new ApiError(404, 'Notification not found.', 'NOTIFICATION_NOT_FOUND');
  }
  return { markedRead: result.count === 1 };
}

export async function markAllNotificationsRead(userId: string) {
  const result = await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return { markedRead: result.count };
}
