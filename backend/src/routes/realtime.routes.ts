import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { ApiError } from '../utils/ApiError';
import { registerStream } from '../utils/realtime';

/**
 * SSE connect rate limit: a browser tab reconnect loop (or a client opening
 * many tabs) must not exhaust server sockets. Copies the bounded-memory
 * sliding-window pattern from middleware/rateLimit.ts — prunes at capacity,
 * refuses new buckets at the hard cap so the map can never grow unbounded.
 */
const WINDOW_MS = 60_000;
const MAX_STREAMS = 10; // new streams per IP per minute
const buckets = new Map<string, number[]>();
const MAX_BUCKETS = 10_000;

function cleanup(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, timestamps] of buckets) {
    const recent = timestamps.filter((time) => now - time < WINDOW_MS);
    if (recent.length === 0) buckets.delete(key);
    else buckets.set(key, recent);
    if (buckets.size < MAX_BUCKETS) break;
  }
}

function streamRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  cleanup(now);
  const key = req.ip || 'unknown';
  const existing = buckets.get(key);
  let recent: number[];
  if (existing) {
    recent = existing.filter((time) => now - time < WINDOW_MS);
  } else if (buckets.size < MAX_BUCKETS) {
    recent = [];
  } else {
    // Hard cap: cleanup could not free a slot, so refuse to create another
    // bucket — the map must never grow without bound.
    res.setHeader('Retry-After', '60');
    next(new ApiError(429, 'Too many live stream connections — please wait a moment.', 'RATE_LIMITED'));
    return;
  }
  if (recent.length >= MAX_STREAMS) {
    res.setHeader('Retry-After', '60');
    next(new ApiError(429, 'Too many live stream connections — please wait a moment.', 'RATE_LIMITED'));
    return;
  }
  recent.push(now);
  buckets.set(key, recent);
  next();
}

const router = Router();

/**
 * GET /api/realtime/stream — Server-Sent Events hub (authenticated).
 *
 * ---------------------------------------------------------------------------
 * EVENT CONTRACT (for the frontend agent)
 * ---------------------------------------------------------------------------
 * Connect: `const es = new EventSource('/api/realtime/stream')` — same-origin
 * so the session cookie is sent automatically; GET means CSRF passes. The
 * server sends an immediate `ready` frame, then `: heartbeat` comment lines
 * every 25s (ignored by EventSource, keep proxies from idling out).
 *
 * Every data frame is `event: <name>` / `id: <seq>` / `data: <JSON>`, and
 * each JSON body is `{ type: <name>, ...payload }` (see below), EXCEPT
 * `notification` where `type` is the NotificationType — the SSE event name
 * is authoritative for dispatch; `data.type` is the notification category.
 *
 *   event: ready
 *     { type: 'ready' }                                     (once, on connect)
 *   event: notification
 *     { type: NotificationType, id, title, message, createdAt }
 *     // NotificationType: CHALLENGE_PUBLISHED | CHALLENGE_SOLVED | FIRST_BLOOD
 *     //                 | BADGE_EARNED | SYSTEM | COMMUNITY
 *   event: leaderboard_update
 *     { type: 'leaderboard_update', scope: 'global' | 'teams' }
 *   event: challenge_solved
 *     { type: 'challenge_solved', challengeId, title, userId, username?, points }
 *   event: first_blood
 *     { type: 'first_blood', challengeId, title, username, points }
 *   event: team_score_update
 *     { type: 'team_score_update', teamId, name, score }
 *   event: instance_status
 *     { type: 'instance_status', slug, status }
 *
 * Dates (createdAt) are ISO-8601 strings. Unknown event names should be
 * ignored, not thrown on. On drop, EventSource auto-reconnects; `id:` lets
 * the server resume ordering if replay is added later.
 * ---------------------------------------------------------------------------
 */
router.get('/stream', streamRateLimit, requireAuth, (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?.id;
  if (!userId) {
    // requireAuth already guarantees this; kept so TS narrowing is honest.
    next(new ApiError(401, 'You must be logged in to do that', 'UNAUTHENTICATED'));
    return;
  }

  // Register first (synchronous — the heartbeat timer cannot interleave
  // mid-tick), reject beyond the per-user/global caps with 429.
  const result = registerStream(userId, res);
  if (result !== 'ok') {
    res.setHeader('Retry-After', '10');
    next(new ApiError(429, result === 'user_cap'
      ? 'Too many live streams for this account — close another tab first.'
      : 'The server is at its live-stream capacity — please retry shortly.', 'RATE_LIMITED'));
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Tells nginx (and friends) not to buffer this response — the deployment
  // note "proxy_buffering off" must still be set in nginx.example.conf.
  res.setHeader('X-Accel-Buffering', 'no');
  req.socket.setNoDelay(true); // small frames flush immediately, no Nagle delay
  res.flushHeaders();
  res.write('event: ready\ndata: {"type":"ready"}\n\n');
  // Cleanup happens in the hub via res 'close'/'error' listeners; the
  // response stays open until the client disconnects.
});

export default router;
