import type { ServerResponse } from 'http';

/**
 * In-process Server-Sent Events hub for the live platform (scoreboard
 * updates, solve/first-blood announcements, per-user notifications).
 *
 * Wire format per event (see routes/realtime.routes.ts for the full
 * contract the frontend agent consumes):
 *
 *   event: <type>\n
 *   id: <monotonic sequence>\n
 *   data: <JSON.stringify({ type, ...data })>\n
 *   \n
 *
 * Usage from services (post-commit only — never call inside a Prisma
 * transaction, and never await the result):
 *
 *   publishEvent('leaderboard_update', { scope: 'global' });          // broadcast
 *   publishToUser(userId, 'notification', { id, title, ... });        // unicast
 *
 * `data` MUST be a plain JSON-serializable object — never spread a Prisma
 * model instance in here (Dates and nested relations either bloat the
 * frame or fail to serialize). Publish functions are fire-and-forget:
 * they never throw into the caller; dead/broken sockets are dropped.
 *
 * Single-process only, like the in-memory rate limiters — multi-instance
 * deployments would need an external bus (e.g. Redis pub/sub) behind these
 * two functions, which is the intended swap seam.
 */
export type SseEventType =
  | 'notification'
  | 'leaderboard_update'
  | 'challenge_solved'
  | 'first_blood'
  | 'team_score_update'
  | 'instance_status';

/** Proxy idle-timeout keepalive, written as an SSE comment line. */
const HEARTBEAT_INTERVAL_MS = 25_000;
/** Per-user concurrent stream cap — reconnect storms must not pin sockets. */
const MAX_STREAMS_PER_USER = 4;
/** Global concurrent stream cap — hard bound on process memory/fds. */
const MAX_GLOBAL_STREAMS = 500;

const streamsByUser = new Map<string, Set<ServerResponse>>();
let globalStreamCount = 0;
let sequence = 0;
let heartbeatTimer: NodeJS.Timeout | null = null;

/** Single write seam: a throwing/dead socket is treated as a dropped stream. */
function safeWrite(res: ServerResponse, chunk: string): boolean {
  try {
    res.write(chunk);
    return true;
  } catch {
    return false;
  }
}

function dropStream(userId: string, res: ServerResponse): void {
  const streams = streamsByUser.get(userId);
  if (!streams || !streams.delete(res)) return;
  globalStreamCount -= 1;
  if (streams.size === 0) streamsByUser.delete(userId);
  if (globalStreamCount <= 0) stopHeartbeat();
}

/**
 * Normalizes the caller-supplied `data` into an object safe to spread into
 * the frame payload. Non-object values are wrapped (`{ value }`) instead of
 * being spread — spreading a primitive silently yields `{}` and would drop
 * the data entirely.
 */
function normalizeData(data: unknown): Record<string, unknown> {
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return data === undefined ? {} : { value: data };
}

function frame(type: SseEventType, data: Record<string, unknown>): string {
  sequence += 1;
  // May throw on circular meta — callers wrap this in try/catch.
  return `event: ${type}\nid: ${sequence}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
}

function startHeartbeat(): void {
  if (heartbeatTimer) return;
  // One shared timer (not per connection) so cost stays flat as clients
  // grow; unref'd so it never keeps the process alive by itself.
  heartbeatTimer = setInterval(() => {
    const chunk = ': heartbeat\n\n';
    for (const [userId, streams] of streamsByUser) {
      for (const res of [...streams]) {
        if (!safeWrite(res, chunk)) dropStream(userId, res);
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref();
}

function stopHeartbeat(): void {
  if (!heartbeatTimer) return;
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

export type RegisterResult = 'ok' | 'user_cap' | 'global_cap';

/**
 * Registers a live SSE response for `userId` and wires cleanup on
 * 'close'/'error'. Returns a cap verdict so the route can reject with 429
 * instead of accepting an unbounded number of sockets. Must be called
 * before the route writes SSE headers, in the same synchronous tick as the
 * initial `ready` frame (no awaits in between).
 */
export function registerStream(userId: string, res: ServerResponse): RegisterResult {
  const existing = streamsByUser.get(userId);
  if (existing && existing.size >= MAX_STREAMS_PER_USER) return 'user_cap';
  if (globalStreamCount >= MAX_GLOBAL_STREAMS) return 'global_cap';

  const streams = existing ?? new Set<ServerResponse>();
  streams.add(res);
  streamsByUser.set(userId, streams);
  globalStreamCount += 1;
  startHeartbeat();

  const cleanup = (): void => dropStream(userId, res);
  res.on('close', cleanup);
  res.on('error', cleanup);
  return 'ok';
}

/**
 * Broadcasts an event to every connected stream. Fire-and-forget: never
 * throws; frames that fail to serialize are silently dropped and dead
 * sockets are pruned as they are hit.
 */
export function publishEvent(type: SseEventType, data: unknown): void {
  let chunk: string;
  try {
    chunk = frame(type, normalizeData(data));
  } catch {
    return; // Unserializable payload — drop rather than break the caller.
  }
  for (const [userId, streams] of streamsByUser) {
    for (const res of [...streams]) {
      if (!safeWrite(res, chunk)) dropStream(userId, res);
    }
  }
}

/** Unicasts an event to one user's streams. No-op when they are offline. */
export function publishToUser(userId: string, type: SseEventType, data: unknown): void {
  const streams = streamsByUser.get(userId);
  if (!streams || streams.size === 0) return;
  let chunk: string;
  try {
    chunk = frame(type, normalizeData(data));
  } catch {
    return;
  }
  for (const res of [...streams]) {
    if (!safeWrite(res, chunk)) dropStream(userId, res);
  }
}

/** Connected-user/stream counts — handy for health output or debugging. */
export function streamStats(): { users: number; streams: number } {
  return { users: streamsByUser.size, streams: globalStreamCount };
}
