import { Prisma } from '@prisma/client';
import { ChallengeStatus, EventStatus, NotificationType, UserActivityType } from '../constants/enums';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { createActivity, recordActivity } from './activity.service';
import { createNotification, createNotifications } from './notification.service';

export type EventDb = Prisma.TransactionClient | typeof prisma;

const eventSummarySelect = {
  id: true, name: true, slug: true, shortDescription: true, description: true, createdBy: true,
  status: true, startAt: true, endAt: true, registrationStartAt: true, registrationEndAt: true,
  maxParticipants: true, registrationRequired: true, createdAt: true, updatedAt: true,
  _count: { select: { registrations: true, challenges: true } },
} satisfies Prisma.EventSelect;

type EventSummaryRow = Prisma.EventGetPayload<{ select: typeof eventSummarySelect }>;
type SqlNumeric = number | bigint;

type EventLeaderboardDbRow = {
  id: string;
  username: string;
  points: SqlNumeric;
  solves: SqlNumeric;
  firstBloods: SqlNumeric;
  lastSolveAt: Date | string | number | bigint | null;
  rank: SqlNumeric;
};

// Prisma stores SQLite DateTime values as epoch milliseconds. MAX() drops the
// column's DATETIME affinity, so its raw result can arrive as a bigint rather
// than a Date; normalize every supported representation at the SQL boundary.
function eventDate(value: EventLeaderboardDbRow['lastSolveAt']): Date | null {
  if (value === null) return null;
  if (value instanceof Date) return value;
  return new Date(typeof value === 'bigint' ? Number(value) : value);
}

function effectiveStatus(event: Pick<EventSummaryRow, 'status'|'startAt'|'endAt'>, now = new Date()): EventStatus {
  if (event.status === EventStatus.DRAFT || event.status === EventStatus.ARCHIVED) return event.status;
  if (now >= event.endAt) return EventStatus.ENDED;
  if (now >= event.startAt) return EventStatus.LIVE;
  return EventStatus.UPCOMING;
}

function publicSummary(row: EventSummaryRow, registered = false) {
  return {
    id: row.id, name: row.name, slug: row.slug, shortDescription: row.shortDescription,
    status: effectiveStatus(row), startAt: row.startAt, endAt: row.endAt,
    registrationStartAt: row.registrationStartAt, registrationEndAt: row.registrationEndAt,
    maxParticipants: row.maxParticipants, registrationRequired: row.registrationRequired,
    participantCount: row._count.registrations, challengeCount: row._count.challenges, registered,
    registrationOpen: row.registrationRequired && new Date() >= row.registrationStartAt && new Date() < row.registrationEndAt && effectiveStatus(row) !== EventStatus.ENDED,
    registrationLocked: registered && (effectiveStatus(row) === EventStatus.LIVE || effectiveStatus(row) === EventStatus.ENDED),
  };
}

function slugify(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160) || 'event';
}

async function uniqueSlug(preferred: string, excludeId?: string): Promise<string> {
  const base = slugify(preferred);
  let candidate = base;
  for (let i = 2; i <= 1000; i += 1) {
    const existing = await prisma.event.findFirst({ where: { slug: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) }, select: { id: true } });
    if (!existing) return candidate;
    candidate = `${base}-${i}`.slice(0, 180);
  }
  throw new ApiError(409, 'Unable to allocate a unique event slug.', 'EVENT_SLUG_CONFLICT');
}

function validateDates(input: { registrationStartAt: Date; registrationEndAt: Date; startAt: Date; endAt: Date }) {
  if (input.registrationStartAt > input.registrationEndAt || input.registrationEndAt > input.startAt || input.startAt >= input.endAt) {
    throw new ApiError(400, 'Event dates are invalid.', 'INVALID_EVENT_DATES');
  }
}

async function registrationState(userId: string, eventId: string) {
  return prisma.eventRegistration.findUnique({ where: { userId_eventId: { userId, eventId } }, select: { id: true, registeredAt: true, completedAt: true } });
}

async function getEventOrThrow(id: string) {
  const event = await prisma.event.findUnique({ where: { id }, select: eventSummarySelect });
  if (!event) throw new ApiError(404, 'Event not found.', 'EVENT_NOT_FOUND');
  return event;
}

async function assertAdminEventExists(id: string) { return getEventOrThrow(id); }

export async function listEvents(userId: string, options: { search?: string; status?: 'UPCOMING'|'LIVE'|'ENDED'; sort: 'start_asc'|'start_desc'|'newest'|'name_asc'; limit: number; offset: number }) {
  const now = new Date();
  const searchWhere: Prisma.EventWhereInput = options.search ? { OR: [{ name: { contains: options.search } }, { description: { contains: options.search } }] } : {};
  const lifecycle: Prisma.EventWhereInput = {
    status: { in: [EventStatus.UPCOMING, EventStatus.LIVE, EventStatus.ENDED] },
    AND: [
      { OR: [
        { status: EventStatus.ENDED },
        { status: { in: [EventStatus.UPCOMING, EventStatus.LIVE] }, startAt: { gt: now } },
        { status: { in: [EventStatus.UPCOMING, EventStatus.LIVE] }, startAt: { lte: now }, endAt: { gt: now } },
        { status: { in: [EventStatus.UPCOMING, EventStatus.LIVE] }, endAt: { lte: now } },
      ] },
      ...(Object.keys(searchWhere).length ? [searchWhere] : []),
    ],
  };
  if (options.status) {
    if (options.status === 'UPCOMING') lifecycle.AND = [{ startAt: { gt: now } }, ...(Object.keys(searchWhere).length ? [searchWhere] : [])];
    if (options.status === 'LIVE') lifecycle.AND = [{ startAt: { lte: now } }, { endAt: { gt: now } }, ...(Object.keys(searchWhere).length ? [searchWhere] : [])];
    if (options.status === 'ENDED') lifecycle.AND = [{ endAt: { lte: now } }, ...(Object.keys(searchWhere).length ? [searchWhere] : [])];
  }
  const orderBy: Prisma.EventOrderByWithRelationInput[] = options.sort === 'start_desc' ? [{ startAt: 'desc' }, { id: 'desc' }] : options.sort === 'newest' ? [{ createdAt: 'desc' }, { id: 'desc' }] : options.sort === 'name_asc' ? [{ name: 'asc' }, { id: 'asc' }] : [{ startAt: 'asc' }, { id: 'asc' }];
  const [rows, total, registrations] = await prisma.$transaction([
    prisma.event.findMany({ where: lifecycle, select: eventSummarySelect, orderBy, skip: options.offset, take: options.limit }),
    prisma.event.count({ where: lifecycle }),
    prisma.eventRegistration.findMany({ where: { userId }, select: { eventId: true } }),
  ]);
  const registered = new Set(registrations.map((r) => r.eventId));
  return { events: rows.map((row) => publicSummary(row, registered.has(row.id))), total, limit: options.limit, offset: options.offset };
}

async function assertVisibleEvent(event: EventSummaryRow) {
  const status = effectiveStatus(event);
  if (status === EventStatus.DRAFT || status === EventStatus.ARCHIVED) throw new ApiError(404, 'Event not found.', 'EVENT_NOT_FOUND');
}

async function assertRegisteredOrOpen(userId: string, event: EventSummaryRow) {
  if (!event.registrationRequired) return null;
  const registration = await registrationState(userId, event.id);
  if (!registration) throw new ApiError(403, 'Event registration is required for this content.', 'EVENT_REGISTRATION_REQUIRED');
  return registration;
}

async function syncLifecycleNotifications(event: EventSummaryRow): Promise<void> {
  const status = effectiveStatus(event);
  if (status === EventStatus.DRAFT || status === EventStatus.ARCHIVED) return;
  const now = new Date();
  const oneHour = 60 * 60 * 1000;
  const fifteenMinutes = 15 * 60 * 1000;
  const registeredUsers = await prisma.eventRegistration.findMany({ where: { eventId: event.id }, select: { userId: true } });
  if (!registeredUsers.length) return;
  const inputs: Parameters<typeof createNotifications>[1] = [];
  const untilStart = event.startAt.getTime() - now.getTime();
  const sinceStart = now.getTime() - event.startAt.getTime();
  const untilEnd = event.endAt.getTime() - now.getTime();
  const sinceEnd = now.getTime() - event.endAt.getTime();
  const phase = untilStart > 0 && untilStart <= oneHour ? 'starting-soon' : sinceStart >= 0 && sinceStart <= fifteenMinutes ? 'started' : sinceEnd >= 0 && sinceEnd <= fifteenMinutes ? 'ended' : null;
  const endingSoon = untilEnd > 0 && untilEnd <= oneHour && sinceStart >= 0;
  for (const { userId } of registeredUsers) {
    if (phase === 'starting-soon') inputs.push({ userId, type: NotificationType.SYSTEM, title: 'Event starting soon', message: `“${event.name}” starts within the next hour.`, link: `/events/${event.id}`, targetId: event.id, dedupeKey: `event-starting-soon:${event.id}:${userId}` });
    if (phase === 'started') inputs.push({ userId, type: NotificationType.SYSTEM, title: 'Event started', message: `“${event.name}” is now live.`, link: `/events/${event.id}`, targetId: event.id, dedupeKey: `event-started:${event.id}:${userId}` });
    if (endingSoon) inputs.push({ userId, type: NotificationType.SYSTEM, title: 'Event ending soon', message: `“${event.name}” ends within the next hour.`, link: `/events/${event.id}`, targetId: event.id, dedupeKey: `event-ending-soon:${event.id}:${userId}` });
    if (phase === 'ended') inputs.push({ userId, type: NotificationType.SYSTEM, title: 'Event ended', message: `“${event.name}” has ended.`, link: `/events/${event.id}`, targetId: event.id, dedupeKey: `event-ended:${event.id}:${userId}` });
  }
  await createNotifications(prisma, inputs);
}


export async function getEvent(userId: string, id: string) {
  const event = await getEventOrThrow(id);
  await assertVisibleEvent(event);
  await syncLifecycleNotifications(event);
  const registration = await registrationState(userId, id);
  const canAccess = !event.registrationRequired || !!registration;
  const summary = publicSummary(event, !!registration);
  if (!canAccess) return { event: { ...summary, description: event.description }, registered: false, accessRestricted: true, challenges: [], announcements: [], leaderboard: [], progress: null };
  const [challenges, announcements, leaderboard, progress] = await Promise.all([getEventChallenges(id, userId), listAnnouncements(id), getEventLeaderboard(id, userId, 10, 0), getMyProgress(userId, id)]);
  return { event: { ...summary, description: event.description }, registered: !!registration, accessRestricted: false, challenges, announcements, leaderboard: leaderboard.entries, progress };
}

export async function getEventChallenges(eventId: string, userId: string) {
  const event = await getEventOrThrow(eventId); await assertVisibleEvent(event); await assertRegisteredOrOpen(userId, event);
  const rows = await prisma.eventChallenge.findMany({ where: { eventId, challenge: { OR: [{ status: ChallengeStatus.PUBLISHED }, { status: ChallengeStatus.ARCHIVED, solves: { some: { userId } } }] } }, orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { id: true, position: true, availableFrom: true, availableUntil: true, challenge: { select: { id: true, title: true, slug: true, points: true, teaser: true, status: true, category: { select: { id: true, name: true } }, difficulty: { select: { id: true, name: true } }, _count: { select: { solves: true } }, solves: { where: { userId }, select: { solvedAt: true }, take: 1 } } } } });
  const now = new Date();
  const ended = effectiveStatus(event) === EventStatus.ENDED;
  return rows.filter((row) => ended || ((!row.availableFrom || row.availableFrom <= now) && (!row.availableUntil || row.availableUntil > now))).map((row) => { const solvedAt = row.challenge.solves[0]?.solvedAt ?? null; const solved = !!solvedAt && solvedAt >= event.startAt && solvedAt <= event.endAt; return { id: row.challenge.id, title: row.challenge.title, slug: row.challenge.slug, points: row.challenge.points, teaser: row.challenge.teaser, status: row.challenge.status, category: row.challenge.category, difficulty: row.challenge.difficulty, position: row.position, availableFrom: row.availableFrom, availableUntil: row.availableUntil, solved, solvedAt: solved ? solvedAt : null, solveCount: row.challenge._count.solves }; });
}

export async function registerForEvent(userId: string, eventId: string) {
  const event = await getEventOrThrow(eventId); await assertVisibleEvent(event);
  const now = new Date();
  if (!event.registrationRequired) return { registered: false, alreadyOpen: true };
  if (now < event.registrationStartAt) throw new ApiError(409, 'Registration has not opened yet.', 'REGISTRATION_NOT_OPEN');
  if (now >= event.registrationEndAt || now >= event.endAt) throw new ApiError(409, 'Registration is closed.', 'REGISTRATION_CLOSED');
  try {
    const registration = await prisma.$transaction(async (tx) => {
      if (event.maxParticipants !== null) {
        const count = await tx.eventRegistration.count({ where: { eventId } });
        if (count >= event.maxParticipants) throw new ApiError(409, 'This event is full.', 'EVENT_FULL');
      }
      const created = await tx.eventRegistration.create({ data: { userId, eventId } });
      await createActivity(tx, { userId, type: UserActivityType.EVENT_REGISTERED, description: `Registered for “${event.name}”.`, targetId: eventId, targetType: 'event' });
      await createNotification(tx, { userId, type: NotificationType.SYSTEM, title: 'Event registration confirmed', message: `You are registered for “${event.name}”.`, link: `/events/${eventId}`, targetId: eventId, dedupeKey: `event-registration:${eventId}:${userId}` });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { registered: true, registeredAt: registration.registeredAt };
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') return { registered: true, duplicate: true };
    if ((error as { code?: string })?.code === 'P2034') throw new ApiError(409, 'Registration could not be completed because the event filled up. Please try again.', 'EVENT_REGISTRATION_CONFLICT');
    throw error;
  }
}

export async function unregisterFromEvent(userId: string, eventId: string) {
  const event = await getEventOrThrow(eventId); await assertVisibleEvent(event);
  const status = effectiveStatus(event);
  if (status === EventStatus.LIVE || status === EventStatus.ENDED) throw new ApiError(409, 'You cannot withdraw after the event has started.', 'REGISTRATION_LOCKED');
  const result = await prisma.eventRegistration.deleteMany({ where: { userId, eventId } });
  if (result.count) await recordActivity({ userId, type: UserActivityType.EVENT_UNREGISTERED, description: `Withdrew from “${event.name}”.`, targetId: eventId, targetType: 'event' });
  return { registered: false };
}

async function getEventLeaderboardInternal(eventId: string, limit: number, offset: number) {
  const rows = await prisma.$queryRaw<EventLeaderboardDbRow[]>`
    WITH ew AS (
      SELECT start_at, end_at FROM events WHERE id = ${eventId}
    ),
    ec_rows AS (
      SELECT challenge_id, available_from, available_until FROM event_challenges WHERE event_id = ${eventId}
    ),
    cfg AS (SELECT registration_required FROM events WHERE id = ${eventId}),
    solve_totals AS (
      SELECT s.user_id, COALESCE(SUM(s.points_awarded),0) AS points, COUNT(*) AS solves, MAX(s.solved_at) AS last_solve_at
      FROM solves s JOIN ec_rows ec ON ec.challenge_id = s.challenge_id CROSS JOIN ew CROSS JOIN cfg
      LEFT JOIN event_registrations er ON er.event_id = ${eventId} AND er.user_id = s.user_id
      WHERE s.solved_at >= ew.start_at AND s.solved_at <= ew.end_at AND (ec.available_from IS NULL OR s.solved_at >= ec.available_from) AND (ec.available_until IS NULL OR s.solved_at < ec.available_until) AND (cfg.registration_required = ${false} OR er.user_id IS NOT NULL)
      GROUP BY s.user_id
    ),
    first_blood_totals AS (
      SELECT fb.user_id, COUNT(*) AS first_bloods
      FROM first_bloods fb JOIN ec_rows ec ON ec.challenge_id = fb.challenge_id CROSS JOIN ew CROSS JOIN cfg
      LEFT JOIN event_registrations er ON er.event_id = ${eventId} AND er.user_id = fb.user_id
      WHERE fb.solved_at >= ew.start_at AND fb.solved_at <= ew.end_at AND (ec.available_from IS NULL OR fb.solved_at >= ec.available_from) AND (ec.available_until IS NULL OR fb.solved_at < ec.available_until) AND (cfg.registration_required = ${false} OR er.user_id IS NOT NULL)
      GROUP BY fb.user_id
    ),
    participants AS (
      SELECT user_id FROM event_registrations WHERE event_id = ${eventId}
      UNION
      SELECT s.user_id FROM solves s JOIN ec_rows ec ON ec.challenge_id = s.challenge_id CROSS JOIN ew CROSS JOIN cfg
      WHERE cfg.registration_required = ${false} AND s.solved_at >= ew.start_at AND s.solved_at <= ew.end_at AND (ec.available_from IS NULL OR s.solved_at >= ec.available_from) AND (ec.available_until IS NULL OR s.solved_at < ec.available_until)
    ),
    scored AS (
      SELECT u.id, u.username, COALESCE(st.points,0) AS points, COALESCE(st.solves,0) AS solves,
             COALESCE(fbt.first_bloods,0) AS first_bloods, st.last_solve_at
      FROM participants p JOIN users u ON u.id = p.user_id
      LEFT JOIN solve_totals st ON st.user_id = u.id
      LEFT JOIN first_blood_totals fbt ON fbt.user_id = u.id
    ),
    ranked AS (
      SELECT *, RANK() OVER (ORDER BY points DESC, solves DESC) AS rank
      FROM scored
    )
    SELECT id, username, points, solves, first_bloods AS "firstBloods", last_solve_at AS "lastSolveAt", rank
    FROM ranked ORDER BY rank ASC, last_solve_at ASC NULLS LAST, username ASC
    LIMIT ${limit} OFFSET ${offset};
  `;
  const countRows = await prisma.$queryRaw<Array<{ count: SqlNumeric }>>`
    WITH ew AS (SELECT start_at, end_at FROM events WHERE id = ${eventId}),
    ec_rows AS (SELECT challenge_id, available_from, available_until FROM event_challenges WHERE event_id = ${eventId}),
    cfg AS (SELECT registration_required FROM events WHERE id = ${eventId}),
    participants AS (
      SELECT user_id FROM event_registrations WHERE event_id = ${eventId}
      UNION
      SELECT s.user_id
      FROM solves s
      JOIN ec_rows ec ON ec.challenge_id = s.challenge_id
      CROSS JOIN ew CROSS JOIN cfg
      WHERE cfg.registration_required = ${false}
        AND s.solved_at >= ew.start_at AND s.solved_at <= ew.end_at
        AND (ec.available_from IS NULL OR s.solved_at >= ec.available_from)
        AND (ec.available_until IS NULL OR s.solved_at < ec.available_until)
    )
    SELECT COUNT(*) AS count FROM participants;`;
  return {
    rows: rows.map((row) => ({
      id: row.id,
      username: row.username,
      points: Number(row.points),
      solves: Number(row.solves),
      firstBloods: Number(row.firstBloods),
      lastSolveAt: eventDate(row.lastSolveAt),
      rank: Number(row.rank),
    })),
    total: Number(countRows[0]?.count ?? 0),
  };
}

export async function getEventLeaderboard(eventId: string, userId: string, limit: number, offset: number) {
  const event = await getEventOrThrow(eventId); await assertVisibleEvent(event); await assertRegisteredOrOpen(userId, event);
  const { rows, total } = await getEventLeaderboardInternal(eventId, limit, offset);
  return { entries: rows.map((row) => ({ id: row.id, username: row.username, points: row.points, solves: row.solves, firstBloods: row.firstBloods, lastSolveAt: row.lastSolveAt, rank: row.rank, isCurrentUser: row.id === userId })), total, limit, offset };
}

export async function getMyProgress(userId: string, eventId: string) {
  const event = await getEventOrThrow(eventId); await assertVisibleEvent(event); const registration = await assertRegisteredOrOpen(userId, event);
  if (!registration && !event.registrationRequired) return { registered: false, solved: 0, totalChallenges: 0, points: 0, firstBloods: 0, completionRate: 0 };
  const result = await prisma.$queryRaw<Array<{ points: SqlNumeric; solves: SqlNumeric; first_bloods: SqlNumeric }>>`
    SELECT COALESCE(SUM(s.points_awarded),0) AS points,
           COUNT(s.challenge_id) AS solves,
           COALESCE(SUM(CASE WHEN fb.challenge_id IS NOT NULL THEN 1 ELSE 0 END),0) AS first_bloods
    FROM event_challenges ec
    CROSS JOIN events e
    LEFT JOIN solves s ON s.challenge_id = ec.challenge_id AND s.user_id = ${userId} AND s.solved_at >= e.start_at AND s.solved_at <= e.end_at AND (ec.available_from IS NULL OR s.solved_at >= ec.available_from) AND (ec.available_until IS NULL OR s.solved_at < ec.available_until)
    LEFT JOIN first_bloods fb ON fb.challenge_id = ec.challenge_id AND fb.user_id = ${userId} AND fb.solved_at >= e.start_at AND fb.solved_at <= e.end_at AND (ec.available_from IS NULL OR fb.solved_at >= ec.available_from) AND (ec.available_until IS NULL OR fb.solved_at < ec.available_until)
    WHERE ec.event_id = ${eventId} AND e.id = ${eventId};
  `;
  const totalChallenges = await prisma.eventChallenge.count({ where: { eventId } });
  const rawRow = result[0] ?? { points: 0, solves: 0, first_bloods: 0 };
  const row = {
    points: Number(rawRow.points),
    solves: Number(rawRow.solves),
    firstBloods: Number(rawRow.first_bloods),
  };
  return { registered: !!registration, solved: row.solves, totalChallenges, points: row.points, firstBloods: row.firstBloods, completionRate: totalChallenges ? Math.round((row.solves / totalChallenges) * 100) : 0 };
}

export async function listAnnouncements(eventId: string) {
  return prisma.eventAnnouncement.findMany({ where: { eventId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50, select: { id: true, title: true, content: true, createdAt: true, updatedAt: true } });
}

export async function createEvent(input: { name: string; slug?: string; shortDescription?: string; description: string; registrationStartAt: Date; registrationEndAt: Date; startAt: Date; endAt: Date; maxParticipants?: number | null; registrationRequired: boolean }, adminId: string) {
  validateDates(input); const slug = await uniqueSlug(input.slug || input.name);
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.event.create({ data: { ...input, slug, createdBy: adminId }, select: eventSummarySelect });
    await createActivity(tx, { userId: adminId, type: UserActivityType.EVENT_CREATED, description: `Created event “${row.name}”.`, targetId: row.id, targetType: 'event' });
    return row;
  });
  return created;
}

export async function updateEvent(id: string, adminId: string, input: Partial<{ name: string; slug?: string; shortDescription?: string; description: string; registrationStartAt: Date; registrationEndAt: Date; startAt: Date; endAt: Date; maxParticipants?: number | null; registrationRequired: boolean }>) {
  const existing = await assertAdminEventExists(id);
  if (existing.status === EventStatus.ARCHIVED) throw new ApiError(409, 'Archived events cannot be edited.', 'EVENT_ARCHIVED');
  const merged = { registrationStartAt: input.registrationStartAt ?? existing.registrationStartAt, registrationEndAt: input.registrationEndAt ?? existing.registrationEndAt, startAt: input.startAt ?? existing.startAt, endAt: input.endAt ?? existing.endAt };
  validateDates(merged);
  if (effectiveStatus(existing) === EventStatus.LIVE || effectiveStatus(existing) === EventStatus.ENDED) throw new ApiError(409, 'Live or ended events cannot have their schedule changed.', 'EVENT_SCHEDULE_LOCKED');
  if (input.maxParticipants !== undefined && input.maxParticipants !== null) {
    const registrations = await prisma.eventRegistration.count({ where: { eventId: id } });
    if (input.maxParticipants < registrations) throw new ApiError(409, 'Maximum participants cannot be lower than the current registration count.', 'EVENT_CAPACITY_TOO_LOW');
  }
  const slug = input.slug !== undefined ? await uniqueSlug(input.slug || input.name || existing.name, id) : undefined;
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.event.update({ where: { id }, data: { ...input, ...(slug ? { slug } : {}) }, select: eventSummarySelect });
    await createActivity(tx, { userId: adminId, type: UserActivityType.EVENT_UPDATED, description: `Updated event “${row.name}”.`, targetId: row.id, targetType: 'event' });
    return row;
  });
  return updated;
}

export async function publishEvent(id: string, adminId: string) {
  const event = await assertAdminEventExists(id); if (event.status !== EventStatus.DRAFT) throw new ApiError(409, 'Only draft events can be published.', 'EVENT_NOT_DRAFT');
  validateDates(event); if (event.endAt <= new Date()) throw new ApiError(409, 'An event must end in the future before publishing.', 'EVENT_ALREADY_ENDED');
  const published = await prisma.$transaction(async (tx) => {
    const row = await tx.event.update({ where: { id }, data: { status: EventStatus.UPCOMING }, select: eventSummarySelect });
    await createActivity(tx, { userId: adminId, type: UserActivityType.EVENT_PUBLISHED, description: `Published event “${row.name}”.`, targetId: row.id, targetType: 'event' });
    return row;
  });
  return published;
}

export async function archiveEvent(id: string, adminId: string) {
  const event = await assertAdminEventExists(id); if (event.status === EventStatus.ARCHIVED) return publicSummary(event);
  const archived = await prisma.$transaction(async (tx) => {
    const row = await tx.event.update({ where: { id }, data: { status: EventStatus.ARCHIVED }, select: eventSummarySelect });
    await createActivity(tx, { userId: adminId, type: UserActivityType.EVENT_ARCHIVED, description: `Archived event “${row.name}”.`, targetId: row.id, targetType: 'event' });
    return row;
  });
  return archived;
}

export async function deleteEvent(id: string, adminId: string) {
  const event = await assertAdminEventExists(id);
  await prisma.$transaction(async (tx) => {
    await tx.event.update({ where: { id }, data: { status: EventStatus.ARCHIVED } });
    await createActivity(tx, { userId: adminId, type: UserActivityType.EVENT_ARCHIVED, description: `Archived event “${event.name}”.`, targetId: id, targetType: 'event' });
  });
  return { deleted: false, archived: true };
}

export async function addEventChallenge(eventId: string, adminId: string, input: { challengeId: string; position?: number; availableFrom?: Date | null; availableUntil?: Date | null }) {
  const event = await assertAdminEventExists(eventId); if (event.status === EventStatus.ARCHIVED) throw new ApiError(409, 'Archived events cannot be changed.', 'EVENT_ARCHIVED'); if (effectiveStatus(event) === EventStatus.LIVE || effectiveStatus(event) === EventStatus.ENDED) throw new ApiError(409, 'Event challenge configuration is locked after the event starts.', 'EVENT_CHALLENGES_LOCKED');
  const challenge = await prisma.challenge.findUnique({ where: { id: input.challengeId }, select: { id: true, status: true } });
  if (!challenge || challenge.status !== 'PUBLISHED') throw new ApiError(409, 'Only published challenges can be added to events.', 'EVENT_CHALLENGE_INVALID');
  if (input.availableFrom && input.availableUntil && input.availableFrom >= input.availableUntil) throw new ApiError(400, 'Invalid challenge availability.', 'INVALID_EVENT_CHALLENGE_WINDOW');
  if (input.availableFrom && input.availableFrom < event.startAt) throw new ApiError(400, 'Challenge availability cannot start before the event.', 'INVALID_EVENT_CHALLENGE_WINDOW');
  if (input.availableUntil && input.availableUntil > event.endAt) throw new ApiError(400, 'Challenge availability cannot end after the event.', 'INVALID_EVENT_CHALLENGE_WINDOW');
  const position = input.position ?? ((await prisma.eventChallenge.aggregate({ where: { eventId }, _max: { position: true } }))._max.position ?? 0) + 1;
  try { return await prisma.$transaction(async (tx) => {
    const created = await tx.eventChallenge.create({ data: { eventId, challengeId: input.challengeId, position, availableFrom: input.availableFrom ?? null, availableUntil: input.availableUntil ?? null }, select: { id: true, challengeId: true, position: true, availableFrom: true, availableUntil: true } });
    await createActivity(tx, { userId: adminId, type: UserActivityType.EVENT_CHALLENGE_CHANGED, description: `Added a challenge to event “${event.name}”.`, targetId: eventId, targetType: 'event' });
    return created;
  }); }
  catch (error) { if ((error as { code?: string })?.code === 'P2002') throw new ApiError(409, 'That challenge is already attached to this event.', 'EVENT_CHALLENGE_EXISTS'); throw error; }
}

export async function removeEventChallenge(eventId: string, adminId: string, challengeId: string) {
  const event = await assertAdminEventExists(eventId);
  if (effectiveStatus(event) === EventStatus.LIVE || effectiveStatus(event) === EventStatus.ENDED) throw new ApiError(409, 'Event challenge configuration is locked after the event starts.', 'EVENT_CHALLENGES_LOCKED');
  const result = await prisma.eventChallenge.deleteMany({ where: { eventId, challengeId } }); if (!result.count) throw new ApiError(404, 'Event challenge not found.', 'EVENT_CHALLENGE_NOT_FOUND');
  await recordActivity({ userId: adminId, type: UserActivityType.EVENT_CHALLENGE_CHANGED, description: `Removed a challenge from event “${event.name}”.`, targetId: eventId, targetType: 'event' });
  return { removed: true };
}

export async function reorderEventChallenges(eventId: string, adminId: string, items: Array<{ challengeId: string; position: number }>) {
  const event = await assertAdminEventExists(eventId);
  if (effectiveStatus(event) === EventStatus.LIVE || effectiveStatus(event) === EventStatus.ENDED) throw new ApiError(409, 'Event challenge configuration is locked after the event starts.', 'EVENT_CHALLENGES_LOCKED');
  const ids = items.map((item) => item.challengeId);
  const attached = await prisma.eventChallenge.findMany({ where: { eventId, challengeId: { in: ids } }, select: { challengeId: true } });
  if (attached.length !== ids.length) throw new ApiError(400, 'Every challenge in the order list must belong to the event.', 'EVENT_CHALLENGE_ORDER_INVALID');
  await prisma.$transaction(async (tx) => {
    for (const item of items) await tx.eventChallenge.update({ where: { eventId_challengeId: { eventId, challengeId: item.challengeId } }, data: { position: item.position } });
    await createActivity(tx, { userId: adminId, type: UserActivityType.EVENT_CHALLENGE_CHANGED, description: 'Reordered event challenges.', targetId: eventId, targetType: 'event' });
  });
  return { updated: items.length };
}

export async function createAnnouncement(eventId: string, adminId: string, input: { title: string; content: string }) {
  const event = await assertAdminEventExists(eventId); if (event.status === EventStatus.ARCHIVED) throw new ApiError(409, 'Archived events cannot receive announcements.', 'EVENT_ARCHIVED');
  const announcement = await prisma.$transaction(async (tx) => {
    const created = await tx.eventAnnouncement.create({ data: { eventId, createdBy: adminId, title: input.title, content: input.content }, select: { id: true, title: true, content: true, createdAt: true, updatedAt: true } });
    const registrations = await tx.eventRegistration.findMany({ where: { eventId }, select: { userId: true } });
    await createNotifications(tx, registrations.map(({ userId }) => ({ userId, type: NotificationType.SYSTEM, title: `Event announcement: ${event.name}`, message: input.title, link: `/events/${eventId}`, targetId: eventId, dedupeKey: `event-announcement:${created.id}:${userId}` })));
    await createActivity(tx, { userId: adminId, type: UserActivityType.EVENT_ANNOUNCEMENT_CREATED, description: `Published an announcement for “${event.name}”.`, targetId: created.id, targetType: 'event_announcement' });
    return created;
  });
  return announcement;
}

export async function updateAnnouncement(eventId: string, adminId: string, announcementId: string, input: { title?: string; content?: string }) {
  const existing = await prisma.eventAnnouncement.findFirst({ where: { id: announcementId, eventId }, select: { id: true } }); if (!existing) throw new ApiError(404, 'Announcement not found.', 'ANNOUNCEMENT_NOT_FOUND');
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.eventAnnouncement.update({ where: { id: announcementId }, data: input, select: { id: true, title: true, content: true, createdAt: true, updatedAt: true } });
    await createActivity(tx, { userId: adminId, type: UserActivityType.EVENT_ANNOUNCEMENT_CREATED, description: 'Updated an event announcement.', targetId: announcementId, targetType: 'event_announcement' });
    return row;
  });
  return updated;
}

export async function deleteAnnouncement(eventId: string, adminId: string, announcementId: string) {
  const result = await prisma.eventAnnouncement.deleteMany({ where: { id: announcementId, eventId } }); if (!result.count) throw new ApiError(404, 'Announcement not found.', 'ANNOUNCEMENT_NOT_FOUND');
  await recordActivity({ userId: adminId, type: UserActivityType.EVENT_ANNOUNCEMENT_CREATED, description: 'Deleted an event announcement.', targetId: announcementId, targetType: 'event_announcement' });
  return { deleted: true };
}

export async function listParticipants(eventId: string, limit: number, offset: number) {
  await assertAdminEventExists(eventId);
  const where = { eventId };
  const [rows, total] = await prisma.$transaction([
    prisma.eventRegistration.findMany({ where, orderBy: [{ registeredAt: 'asc' }, { id: 'asc' }], skip: offset, take: limit, select: { id: true, registeredAt: true, completedAt: true, user: { select: { id: true, username: true, createdAt: true } } } }),
    prisma.eventRegistration.count({ where }),
  ]);
  return { participants: rows, total, limit, offset };
}

export async function removeParticipant(eventId: string, adminId: string, registrationId: string) {
  const result = await prisma.eventRegistration.deleteMany({ where: { id: registrationId, eventId } }); if (!result.count) throw new ApiError(404, 'Registration not found.', 'REGISTRATION_NOT_FOUND');
  await recordActivity({ userId: adminId, type: UserActivityType.EVENT_UPDATED, description: 'Removed an event registration as an administrator.', targetId: eventId, targetType: 'event' });
  return { removed: true };
}

export async function getEventStats(eventId: string) {
  const event = await assertAdminEventExists(eventId);
  const [totalRegistrations, aggregateRows, firstBloodRows, challengeDistribution] = await Promise.all([
    prisma.eventRegistration.count({ where: { eventId } }),
    prisma.$queryRaw<Array<{ total_solves: SqlNumeric; unique_solvers: SqlNumeric; total_points: SqlNumeric | null }>>`
      SELECT COUNT(s.challenge_id) AS total_solves, COUNT(DISTINCT s.user_id) AS unique_solvers, COALESCE(SUM(s.points_awarded),0) AS total_points
      FROM solves s
      JOIN event_challenges ec ON ec.challenge_id = s.challenge_id
      CROSS JOIN events e
      LEFT JOIN event_registrations er ON er.event_id = e.id AND er.user_id = s.user_id
      WHERE ec.event_id = e.id AND e.id = ${eventId}
        AND s.solved_at >= e.start_at AND s.solved_at <= e.end_at
        AND (ec.available_from IS NULL OR s.solved_at >= ec.available_from) AND (ec.available_until IS NULL OR s.solved_at < ec.available_until)
        AND (e.registration_required = ${false} OR er.user_id IS NOT NULL);
    `,
    prisma.$queryRaw<Array<{ count: SqlNumeric }>>`
      SELECT COUNT(*) AS count
      FROM first_bloods fb
      JOIN event_challenges ec ON ec.challenge_id = fb.challenge_id
      CROSS JOIN events e
      LEFT JOIN event_registrations er ON er.event_id = e.id AND er.user_id = fb.user_id
      WHERE ec.event_id = e.id AND e.id = ${eventId}
        AND fb.solved_at >= e.start_at AND fb.solved_at <= e.end_at
        AND (ec.available_from IS NULL OR fb.solved_at >= ec.available_from) AND (ec.available_until IS NULL OR fb.solved_at < ec.available_until)
        AND (e.registration_required = ${false} OR er.user_id IS NOT NULL);
    `,
    prisma.$queryRaw<Array<{ challenge_id: string; position: SqlNumeric; title: string; points: SqlNumeric; total_solves: SqlNumeric }>>`
      SELECT ec.challenge_id, ec.position, c.title, c.points, COUNT(s.challenge_id) AS total_solves
      FROM event_challenges ec
      JOIN challenges c ON c.id = ec.challenge_id
      JOIN events e ON e.id = ec.event_id
      LEFT JOIN solves s ON s.challenge_id = ec.challenge_id
        AND s.solved_at >= e.start_at AND s.solved_at <= e.end_at
        AND (ec.available_from IS NULL OR s.solved_at >= ec.available_from) AND (ec.available_until IS NULL OR s.solved_at < ec.available_until)
      LEFT JOIN event_registrations er ON er.event_id = e.id AND er.user_id = s.user_id
      WHERE ec.event_id = ${eventId}
        AND (e.registration_required = ${false} OR er.user_id IS NOT NULL)
      GROUP BY ec.challenge_id, ec.position, c.title, c.points
      ORDER BY ec.position ASC, c.title ASC;
    `,
  ]);
  const aggregate = aggregateRows[0] ?? { total_solves: 0, unique_solvers: 0, total_points: 0 };
  const totalSolves = Number(aggregate.total_solves);
  const uniqueSolvers = Number(aggregate.unique_solvers);
  const totalEventPoints = Number(aggregate.total_points ?? 0);
  const firstBloodCount = Number(firstBloodRows[0]?.count ?? 0);
  const completionRate = totalRegistrations ? Math.round((uniqueSolvers / totalRegistrations) * 100) : 0;
  return { eventId: event.id, totalRegistrations, activeParticipants: uniqueSolvers, totalSolves, uniqueSolvers, totalEventPoints, firstBloodCount, completionRate, challengeDistribution: challengeDistribution.map((row) => ({ challengeId: row.challenge_id, title: row.title, position: Number(row.position), points: Number(row.points), totalSolves: Number(row.total_solves) })) };
}

export async function getAdminEvent(eventId: string) {
  const event = await assertAdminEventExists(eventId);
  const [challenges, announcements, stats] = await Promise.all([
    prisma.eventChallenge.findMany({ where: { eventId }, orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { id: true, challengeId: true, position: true, availableFrom: true, availableUntil: true, challenge: { select: { id: true, title: true, status: true, points: true, category: { select: { name: true } }, difficulty: { select: { name: true } } } } } }),
    listAnnouncements(eventId), getEventStats(eventId),
  ]);
  return { event: publicSummary(event), details: { description: event.description }, challenges, announcements, stats };
}

export async function listAdminEvents(options: { status?: EventStatus; limit: number; offset: number; search?: string }) {
  const now = new Date();
  const searchWhere: Prisma.EventWhereInput = options.search ? { OR: [{ name: { contains: options.search } }, { slug: { contains: options.search } }] } : {};
  let lifecycle: Prisma.EventWhereInput = {};
  if (options.status === EventStatus.DRAFT || options.status === EventStatus.ARCHIVED) lifecycle = { status: options.status };
  else if (options.status === EventStatus.UPCOMING) lifecycle = { status: { in: [EventStatus.UPCOMING, EventStatus.LIVE] }, startAt: { gt: now } };
  else if (options.status === EventStatus.LIVE) lifecycle = { status: { in: [EventStatus.UPCOMING, EventStatus.LIVE] }, startAt: { lte: now }, endAt: { gt: now } };
  else if (options.status === EventStatus.ENDED) lifecycle = { OR: [{ status: EventStatus.ENDED }, { status: { in: [EventStatus.UPCOMING, EventStatus.LIVE] }, endAt: { lte: now } }] };
  const where: Prisma.EventWhereInput = { ...lifecycle, ...(Object.keys(searchWhere).length ? { AND: [searchWhere] } : {}) };
  const [rows, total] = await prisma.$transaction([prisma.event.findMany({ where, select: eventSummarySelect, orderBy: [{ startAt: 'desc' }, { id: 'desc' }], take: options.limit, skip: options.offset }), prisma.event.count({ where })]);
  return { events: rows.map((row) => publicSummary(row)), total, limit: options.limit, offset: options.offset };
}
