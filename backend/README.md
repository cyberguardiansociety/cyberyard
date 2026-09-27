# CyberYardHub Backend

Node.js + TypeScript + Express + Prisma + SQLite API for CyberYardHub.

**Current status:** Phases 1–8 are implemented: authentication and server-side
sessions, challenges/solves, leaderboard and user stats, admin challenge management,
hints, challenge files, writeups, badges/achievements, and community posts/comments.
Phase 9 hardens the existing platform for security and deployment readiness; it does
not add new user-facing functionality.

For local development, run the backend from this directory and serve the existing
static frontend separately from the project root. See the deployment and security
section below for production configuration requirements.

---

## Prerequisites

- **Node.js 20.19+** (check with `node -v`)
- **SQLite** is built into Prisma's supported stack; no database server,
  credentials, or Docker service is required. The database is a local file
  under `backend/prisma/` (see the database steps below).
- Redis is **not** required yet — sessions are stored in the local SQLite
  database this phase (see "Session architecture" below)

---

## 1. Install dependencies

From inside this `backend/` folder:

```bash
npm install
```

No new packages were added this phase — flag hashing uses Node's built-in
`crypto` module.

## 2. Configure environment variables

```bash
cp .env.example .env
```

Set, at minimum:

- `DATABASE_URL` — the local SQLite file URL, for example
  `file:./dev.db?connection_limit=1`
- `SESSION_SECRET` — signs the session cookie (see Phase 2). Generate with
  `openssl rand -base64 48`
- `FLAG_HASH_SECRET` — **new this phase.** Keys the HMAC-SHA256 used to
  hash correct flags and submitted attempts. Generate a *different* random
  value the same way:
  ```bash
  openssl rand -base64 48
  ```
  Keep this separate from `SESSION_SECRET` — rotating one should never
  invalidate the other.
- `CORS_ORIGIN` — the origin your frontend is served from

**Never commit your real `.env` file.** It's already in `.gitignore`.

## 3. Create the local database

This project uses one SQLite file, `prisma/dev.db` by default. There is no
database server to install or start. Apply the committed fresh-schema
migration with:

```bash
npx prisma migrate deploy
```

The init migration creates the complete schema in one step. It is safe to run
on a new local database; do not point it at an existing PostgreSQL deployment
(the SQLite change intentionally starts with a fresh database only).

## 4. Seed reference + sample data

```bash
npm run prisma:seed
```

This now does three things, in order, every time it's run (each step is
idempotent — safe to re-run):

1. **Categories and difficulties** — always seeded (`Web Exploitation`,
   `Cryptography`, `Forensics`, `Binary Exploitation`; `Easy` through
   `Insane`). Not secret, safe in any environment.
2. **Five sample challenges**, one per category/difficulty combination
   used above, each with a real flag hashed with `FLAG_HASH_SECRET` before
   being written to the database. The plaintext flags exist only inside
   `prisma/seed.ts` and are printed once to your terminal when they're
   created, purely so you have something to test
   `POST /api/challenges/:id/submit` with locally. They are never stored
   in plaintext and never appear in any API response.
3. **Admin account** — unchanged from Phase 2, still opt-in via
   `SEED_ADMIN_EMAIL`/`SEED_ADMIN_USERNAME`/`SEED_ADMIN_PASSWORD`
   environment variables, skipped entirely if they're not set.

## 5. Run the server

```bash
npm run dev       # development, auto-restart
npm run build && npm start   # production
npm run type-check            # type-check only
```

## 6. Try it out

```bash
# List published challenges
curl http://localhost:4000/api/challenges

# Filter
curl "http://localhost:4000/api/challenges?category=Cryptography&difficulty=Easy"
curl "http://localhost:4000/api/challenges?search=sqli"

# Categories / difficulties
curl http://localhost:4000/api/categories
curl http://localhost:4000/api/difficulties

# Detail view
curl http://localhost:4000/api/challenges/<id-from-the-list-above>

# Submit a flag (requires being logged in — see Phase 2's README section
# for register/login; reuse the cookie here)
curl -i -X POST http://localhost:4000/api/challenges/<id>/submit \
  -H "Content-Type: application/json" \
  -H "Cookie: cyh_session=<your session cookie value>" \
  -d '{"flag":"CYBH{sql1_1nj3ct10n_101}"}'
```

---

## API endpoints implemented so far

| Method | Path | Auth required | Description |
|--------|------|----------------|-------------|
| GET | `/api/health` | No | Liveness + DB connectivity check |
| POST | `/api/auth/register` | No | Create an account, starts a session |
| POST | `/api/auth/login` | No | Verify credentials, starts a session |
| POST | `/api/auth/logout` | No | Destroys the current session, if any |
| GET | `/api/auth/me` | **Yes** | Returns the current session's user |
| GET | `/api/categories` | No | All categories |
| GET | `/api/difficulties` | No | All difficulties, in display order |
| GET | `/api/challenges` | No* | List published challenges. `?search=&category=&difficulty=` |
| GET | `/api/challenges/:id` | No* | Full detail for one published challenge |
| POST | `/api/challenges/:id/submit` | **Yes** | Submit a flag attempt |

\* Not required, but if you *are* logged in (session cookie present), the
response's `solved` field reflects your own solve state; logged-out
requests always get `solved: false`.

### Request/response shapes

**GET /api/challenges**
```json
{
  "challenges": [
    {
      "id": "…uuid…",
      "title": "Baby SQLi",
      "category": { "id": 1, "name": "Web Exploitation" },
      "difficulty": { "id": 1, "name": "Easy" },
      "points": 150,
      "teaser": "A login form that trusts user input a little too much.",
      "solved": false
    }
  ]
}
```

**GET /api/challenges/:id** — same shape, plus `"description"` and
`"createdAt"`. Never includes a flag field of any kind.

**GET /api/categories** → `{ "categories": [{ "id": 1, "name": "...", "slug": "..." }] }`

**GET /api/difficulties** → `{ "difficulties": [{ "id": 1, "name": "Easy", "sortOrder": 1 }] }`

**POST /api/challenges/:id/submit**
```json
// request
{ "flag": "CYBH{sql1_1nj3ct10n_101}" }
// response 200
{ "correct": true, "alreadySolved": false, "pointsAwarded": 150 }
```
On a repeat correct submission: `{ "correct": true, "alreadySolved": true, "pointsAwarded": 0 }`.
On a wrong guess: `{ "correct": false, "alreadySolved": false, "pointsAwarded": 0 }`.
The actual flag string is never present in any response, ever.

---

## Flag hashing and submission flow

**Storage.** A challenge's correct flag lives in its own `flags` table row
(`flagHash` + `caseSensitive`), one-to-one with the challenge, never in
the `challenges` table itself — so a bug that accidentally serializes a
whole `Challenge` row still can't leak a flag, because the flag isn't on
that row at all. `flagHash` is computed with **HMAC-SHA256, keyed with
`FLAG_HASH_SECRET`** (`src/utils/flagHash.ts`), not a slow password hash
like Argon2 — flags are compared far more often than passwords are, and a
keyed hash is already unrecoverable from a database leak without the
server-side secret, so the extra cost of a slow hash buys nothing here.

**Why not just store it encrypted/plaintext?** A hash means even a
database compromise plus a stolen `FLAG_HASH_SECRET` from two different
places is needed to recover flags, and — more simply — no code path,
including a buggy one, can ever accidentally return the real flag in a
response, because the real flag is never held in memory anywhere except
during the one HMAC computation at write time (seed/future admin-create)
and the one comparison at submit time.

**Verification, step by step** (`src/services/submission.service.ts`):
1. Look up the challenge (must be published) and its flag's hash —
   nonexistent, unpublished, and "no flag configured" all produce the
   *same* 404, so a caller can't distinguish them.
2. Hash the submitted value the same way (same normalization: trimmed,
   case-folded only if the challenge is configured case-insensitive) and
   compare with `crypto.timingSafeEqual`.
3. Record a `submissions` row either way — `isCorrect` plus a hash of
   what was typed (`hashSubmissionForAudit`, a separate unkeyed SHA-256
   used only for audit/abuse review, not for the security comparison) —
   never the plaintext guess.
4. If correct, attempt to create a `solves` row (see scoring flow below).

**Never leaked:** the real flag, the flag hash, the session cookie value,
or `passwordHash` — none of these are selected by any query that feeds an
API response in this codebase.

---

## Scoring / solve flow

A `solves` row is the single source of truth for "this user has this
challenge's points." Its primary key is the **composite** `(userId,
challengeId)` — not a surrogate id — specifically so the database itself
guarantees a user can never have two solve rows for the same challenge.

On a correct submission, `submitFlag()` doesn't check-then-insert (which
would leave a race window for two concurrent correct submissions to both
pass a "have they solved this?" check before either writes). Instead it
always attempts `solve.create(...)` inside a transaction and lets the
composite primary key reject a duplicate:

- **First correct submission:** insert succeeds → `pointsAwarded` is set
  to the challenge's current point value and frozen on that row (a later
  change to the challenge's `points` never rewrites past scores) →
  response is `{ correct: true, alreadySolved: false, pointsAwarded: N }`.
- **Any later correct submission** (repeat, or a concurrent duplicate that
  lost the race): insert fails with Prisma's unique-constraint error
  (`P2002`), which is caught and treated as "already solved" rather than
  an error → response is `{ correct: true, alreadySolved: true,
  pointsAwarded: 0 }`.
- **Incorrect submission:** no solve attempt at all →
  `{ correct: false, alreadySolved: false, pointsAwarded: 0 }`.

There is deliberately no leaderboard or user-stats aggregation yet — that
reads from this same `solves` table in the next phase, but isn't built
until then.

---

## Security
### Final security hardening

The current API keeps the existing server-side session/RBAC model and adds a small administrator write limiter plus structured administrator audit events. Audit records contain only safe metadata such as actor id/role, action, target id, route, status, duration, and timestamp; request bodies are never recorded, so passwords, flags, reset tokens, and uploaded contents are excluded. State-changing administrator routes share the same guard across challenge, hint/file/writeup, category/difficulty, and badge management.

API responses are marked `Cache-Control: no-store` to reduce accidental caching of authenticated account/activity responses. Unexpected errors are logged with server-side diagnostic fields without returning stack traces or database/driver details to clients.

The rate limiters remain in-memory and single-process. Multi-instance production deployment should move them to a shared store before horizontal scaling.
 notes added this phase

- **Rate limiting on flag submissions** (`src/middleware/rateLimit.ts`):
  10 attempts per rolling 60 seconds, per authenticated user. This is an
  **in-memory, single-process** limiter — it resets on restart and does
  not coordinate across multiple server instances. That's a known,
  documented limitation of the current single-instance architecture, not
  an oversight; it's isolated to one file specifically so it can be
  swapped for a Redis-backed limiter later (the same INCR+TTL pattern
  planned for sessions) without touching any route or controller.
- **Flag existence isn't leaked.** A missing challenge, an unpublished
  challenge, and a published challenge with no flag configured all return
  the identical 404 — no response difference exists for a caller to probe
  which challenge ids are valid or which are staged-but-not-flagged.
- **Timing-safe comparison** (`crypto.timingSafeEqual`) for flag hash
  matching, so response latency can't be used to infer partial correctness.
- **Transactions around every solve-affecting write**, relying on a real
  database constraint (the composite primary key) rather than
  application-level locking, so correctness holds even under concurrent
  requests or multiple server processes later.
- Everything from Phase 2 (Argon2id, generic login errors, signed httpOnly
  cookies, Zod validation, `toPublicUser()`) is unchanged and still in effect.

---

## Frontend integration (Phase 4)

The existing frontend (`index.html`, `css/`, `js/`) is now wired to this
API. What changed, and how to run both halves together locally:

**New file:** `js/api.js` — a small `fetch()` wrapper, loaded before
`js/script.js`, exposing `window.CyberYardHubAPI`. Every request sets
`credentials: 'include'` so the session cookie travels automatically;
this file never reads or stores the cookie value itself.

**Serving the frontend.** The frontend has no bundler or dev server of
its own, so serve its folder with any static file server rather than
opening `index.html` directly via `file://` (a `file://` page has no
usable origin for CORS/cookies). From the project root:
```bash
npx serve -l 5500 .
```
Then set `CORS_ORIGIN` in the backend's `.env` to match exactly, e.g.
`http://localhost:5500`.

**Why the session cookie still works across two different ports.**
`http://localhost:5500` (frontend) and `http://localhost:4000` (backend)
are different *origins* but the same *site* — browsers define "site" as
scheme + registrable domain, ignoring port, and `localhost` has no
registrable domain to differ on. That means the existing
`SameSite=Lax, httpOnly` cookie (see `src/utils/cookies.ts`, unchanged
since Phase 2) is still sent on the frontend's cross-port `fetch()` calls
without weakening it to `SameSite=None` or turning off `httpOnly`/
`secure`'s production gating. If the frontend and backend are ever
deployed on genuinely different domains later, that cookie configuration
would need revisiting then — not something to relax preemptively now.

**If you point the frontend at a backend on a different host/port**, edit
`js/api.js`'s default, or override without touching the file by adding
before its `<script>` tag in `index.html`:
```html
<meta name="cyberyardhub-api-base" content="http://your-host:4000/api">
```

**What actually changed in the frontend, and what didn't:**
- Auth (login/register/logout/session-check) and challenges
  (list/detail/filter/search/submit) now call this API — see the root
  project's frontend notes for the full before/after.
- Settings/theme/notification preferences remain frontend-only
  (`localStorage`), since there's no backend endpoint for them yet — this
  is the "non-sensitive UI preference" case, not an auth concern.
- The leaderboard remains the frontend's own placeholder mock data — no
  leaderboard endpoint exists yet (next phase).
- Changing your password from the Settings page now shows a clear "not
  connected yet" message instead of a fake local success, since there's
  no `PATCH`-password endpoint yet and the old local-hash comparison it
  used no longer has anything to compare against (passwords are hashed
  server-side now, and never leave the server).

---



## Phase 9 security and deployment readiness

The API applies Helmet security headers, disables the Express `X-Powered-By` header,
uses explicit credentialed CORS origins, bounds JSON/urlencoded request bodies, and
uses server-side Origin/Referer checks for browser state-changing requests. Session
cookies remain `httpOnly`, signed, `SameSite=Lax`, and become `Secure` in production.
Authentication endpoints have an in-memory abuse limiter, and flag/community writes
retain their existing rate limits. These in-memory limits are single-process only;
use a shared store/rate limiter before running multiple API instances.

### Production environment

Set `NODE_ENV=production`, a SQLite `DATABASE_URL` such as
`file:./dev.db?connection_limit=1`, an explicit HTTPS `CORS_ORIGIN`, and
independently generated random `SESSION_SECRET` and `FLAG_HASH_SECRET` values
(at least 32 characters each). Do not use placeholder values from
`.env.example`. The real `.env` file is ignored by Git.

### Build and run

```bash
npm install
npm run prisma:generate
npx prisma migrate deploy
npm run build
npm start
```

The database is a local SQLite file, so there is no database service to
install or run. Apply the committed migration to the intended file with
`npx prisma migrate deploy`; never use `prisma migrate reset` in production.
The health endpoint is `GET /api/health`; it reports application liveness and a
best-effort database status.

### Challenge-file storage

Challenge files are kept under the application-controlled `storage/challenge-files`
directory and are not served as static files. Downloads go through the authenticated
challenge-file endpoint. Configure filesystem permissions so the runtime user can read
and write only the required application storage. Back up this directory alongside the
database if challenge files are important to the deployment.

### Admin bootstrap

For a development/bootstrap operation only, the seed script can create an admin from
`SEED_ADMIN_EMAIL`, `SEED_ADMIN_USERNAME`, and `SEED_ADMIN_PASSWORD`. Do not commit
those values or use a real production password in shell history/source files.

### Testing limitation

Full integration testing requires installed npm dependencies and a writable
local SQLite database file.

## Folder structure

```
backend/
├── src/
│   ├── config/env.ts
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── categories.controller.ts        Phase 3
│   │   ├── challenges.controller.ts        Phase 3 — list / detail / submit
│   │   ├── difficulties.controller.ts      Phase 3
│   │   └── health.controller.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts              attachUser (global) + requireAuth
│   │   ├── errorHandler.ts                 Zod / Prisma P2002/P1008 / ApiError → consistent JSON
│   │   ├── notFound.ts
│   │   └── rateLimit.ts                    Phase 3 — in-memory flag-submit limiter
│   ├── routes/
│   │   ├── index.ts
│   │   ├── auth.routes.ts
│   │   ├── categories.routes.ts            Phase 3
│   │   ├── challenges.routes.ts            Phase 3
│   │   ├── difficulties.routes.ts          Phase 3
│   │   └── health.routes.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── category.service.ts             Phase 3
│   │   ├── challenge.service.ts            Phase 3 — list/detail, flag NEVER selected
│   │   ├── difficulty.service.ts           Phase 3
│   │   ├── session.service.ts
│   │   ├── session.store.ts                SessionStore interface (Redis-ready seam)
│   │   ├── submission.service.ts           Phase 3 — verify + score, transactional
│   │   └── user.service.ts                 toPublicUser() — the only sanctioned response shape
│   ├── validation/
│   │   ├── auth.schema.ts
│   │   └── challenges.schema.ts            Phase 3 — list query / :id param / submit body
│   ├── types/express.d.ts
│   ├── utils/
│   │   ├── ApiError.ts
│   │   ├── asyncHandler.ts
│   │   ├── cookies.ts
│   │   ├── flagHash.ts                     Phase 3 — HMAC-SHA256 hash/verify, audit hash
│   │   ├── logger.ts
│   │   ├── password.ts                     Argon2id (unchanged)
│   │   ├── prisma.ts
│   │   └── sessionToken.ts
│   ├── app.ts
│   └── server.ts
├── prisma/
│   ├── schema.prisma                       + categories, difficulties, challenges, flags, submissions, solves
│   └── seed.ts                             + category/difficulty/challenge seeding (Phase 3)
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## What's intentionally NOT here yet

- Leaderboard or user-statistics endpoints (they'll read from `solves`,
  built next phase)
- Settings/profile-editing endpoints (`user_settings`/`profiles` tables
  exist since Phase 2; still no routes read/write them)
- Hints, challenge files, or write-ups
- Admin/challenge-management endpoints (creating/editing challenges or
  flags currently only happens via the seed script)
- Any frontend change — it still runs entirely on its own mock data

The route index (`src/routes/index.ts`) lists upcoming groups as comments,
in the order they're expected to arrive.


## Authentication + account security configuration

Modification 1 adds server-side password recovery, email verification, session management, password changes, and security-event auditing.

Required for production email delivery:

- `FRONTEND_URL` — deployed frontend origin, e.g. `https://app.example.com`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE` (`true` or `false`)
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Password-reset and verification links keep their opaque token in the URL fragment (`#...`) so the static frontend server does not receive the token in its request URL. The browser immediately removes the fragment after reading it, keeps the token only in memory, and submits it once to the API. The database stores only SHA-256 token hashes.

The SQLite init migration is the single fresh-schema migration and is applied
with `npx prisma migrate deploy`. It is intended for a new local database;
there is no in-place PostgreSQL-to-SQLite upgrade.

## Modification 2 — Challenge Management + CTF Lifecycle

Challenge lifecycle is now server-enforced with three states:

- `DRAFT` — admin-only; excluded from normal challenge APIs, searches, and active user views.
- `PUBLISHED` — visible to authenticated users and accepts submissions.
- `ARCHIVED` — excluded from active lists and rejects new submissions. A user who previously solved an archived challenge may still open its detail/history and already-available extras, preserving historical access without reopening the challenge.

The fresh SQLite schema includes the challenge lifecycle fields, stable unique
challenge slug, publication/archive timestamps, a concurrency-safe
`first_bloods` table, and challenge-target metadata for security events. The
`status` value is authoritative in application logic while `is_published` is
maintained as a compatibility mirror.

Apply the schema to a new local file with:

```text
npx prisma generate
npx prisma migrate deploy
```

Flag values remain HMAC-protected and are never returned by public or admin challenge APIs.

Submission limiting remains the existing in-memory single-process limiter (10 attempts/minute/user). Administrator mutations remain protected by the existing in-memory administrator limiter. For multi-instance production deployment, use a shared rate-limit store.

## Modification 3 — Notifications + User Activity

The platform now has server-backed notifications and a per-user activity timeline.

### Notification types

`CHALLENGE_PUBLISHED`, `CHALLENGE_SOLVED`, `FIRST_BLOOD`, `BADGE_EARNED`, `SYSTEM`, `COMMUNITY`.

### Activity types

Account registration, successful login, challenge solve, First Blood, badge earned, profile/security events, and community post/comment actions are represented by the canonical controlled `UserActivityType` string values.

### API

```text
GET   /api/notifications
GET   /api/notifications/unread-count
PATCH /api/notifications/:id/read
PATCH /api/notifications/read-all
GET   /api/activity
```

All endpoints require authentication. Notification IDs are always resolved together with the authenticated owner ID. Pagination is server-side and newest-first.

### Migration

The single fresh SQLite init migration creates the notification/activity
columns, tables, relations, and indexes. Enum-like values are stored as TEXT;
the canonical values live in `src/constants/enums.ts` and are validated at the
API edges. It is applied with `npx prisma migrate deploy` to a new local file.

### Automatic events

Challenge publication, solves, First Blood, badge awards and community replies can create notifications. Registration, login, solve, First Blood, badge, verification/password/session events and community actions create safe user activity records. Solve-related notification/activity creation is transactional with the solve.

Notification/activity metadata is bounded and does not contain passwords, password hashes, session tokens, raw flags, reset tokens or verification tokens.

### Testing limitation

The implementation must not be treated as live SQLite/E2E verified unless the
environment has working npm dependencies and a writable local database file.
Static syntax and structural checks can still be run independently.

## Modification 4 — Advanced Gamification

Gamification is server-authoritative. Challenge solve XP is `pointsAwarded + difficulty bonus` (Easy 10, Medium 20, Hard 35, Expert/Insane 50), First Blood awards 50 XP, and a newly awarded badge awards 25 XP. XP rewards use unique event keys and are persisted in `xp_transactions`.

Level `L` requires `100 * (L - 1) * L / 2` cumulative XP. Streaks use UTC calendar dates and only unique successful challenge solves qualify; same-day solves do not extend a streak.

Endpoints: `/api/gamification/me`, `/api/gamification/progress`, `/api/gamification/achievements`, `/api/gamification/category-progress`, `/api/gamification/difficulty-progress`.

Migration: the single fresh `20260924020000_sqlite_init` migration. No reset or
destructive migration is used.

## Modification 5 — Community & Social Features

The community system now uses the existing routes/controllers/services/validation/Prisma architecture and adds:

- controlled cybersecurity-focused post categories;
- paginated/searchable/sortable authenticated community feed;
- owner-only post/comment editing and deletion;
- LIKE reactions with database uniqueness;
- secure follow/unfollow and block/unblock relationships;
- public profile data with self-editable username/bio/avatar URL only;
- post/comment reporting with controlled reasons and moderation status;
- ADMIN-only report review and content moderation;
- social notifications through the existing `Notification` service;
- social activity through the existing `UserActivity` service;
- action-specific bounded community rate limits;
- block-aware interaction and feed filtering;
- no community XP rewards, preserving Modification 4's server-authoritative gamification.

### Migration
The single fresh `20260924020000_sqlite_init` migration creates the community
schema and indexes. Report target foreign keys use `SET NULL` so moderation
history survives content removal. It does not reset or delete existing data.

### Security
All state-changing routes require the existing session authentication and global CSRF/origin middleware. Ownership and ADMIN checks happen server-side. User-generated text is bounded and rendered as escaped text in the SPA. No emails, credentials, sessions, reset/verification tokens, or private security data are exposed by social endpoints.

### Testing limitations
Static JavaScript/HTML/CSS/schema/migration checks can be run without a
database server. Live Prisma generation/migration, database-backed social
flows, and end-to-end regression testing require the project's dependencies and
a writable local SQLite file; results must not be represented as passed when
that environment is unavailable.

## Modification 6 — CTF / Event Management

The backend now includes a CTF event management layer that reuses the existing challenge, solve, First Blood, notification and activity systems.

### Event lifecycle
Events use `DRAFT`, `UPCOMING`, `LIVE`, `ENDED`, and `ARCHIVED`. Only administrators can publish/archive events. `LIVE` and `ENDED` are derived server-side from the configured timestamps, so clients cannot forge event state.

### Registration and participation
`EventRegistration` has a database unique constraint on `(userId,eventId)`. Registration is available only inside the configured registration window, is capacity-checked in a serializable transaction, and cannot be withdrawn after the event starts.

### Event challenges and scoring
`EventChallenge` associates existing published challenges with an event and supports ordering plus optional availability windows. There is no duplicate flag/solve or XP system. Event score is calculated from the existing `Solve.pointsAwarded` records whose solve times fall inside the event window. Global XP, levels, streaks, badges and the global leaderboard are unchanged.

### Event leaderboard and statistics
Event leaderboards are server-calculated and expose rank, username, event points, event solves, First Blood count and last solve time. Aggregate statistics include registrations, active participants, event solves, unique solvers, total event points, challenge distribution, completion rate and First Blood count.

### Announcements and notifications
ADMIN users can publish plain-text announcements. Registered participants receive announcement and registration notifications through the existing notification architecture. Event lifecycle notifications use dedupe keys and are synchronized when event endpoints are accessed; there is no background scheduler in this phase.

### API
User routes:
- `GET /api/events`
- `GET /api/events/:id`
- `GET /api/events/:id/challenges`
- `GET /api/events/:id/leaderboard`
- `GET /api/events/:id/announcements`
- `GET /api/events/:id/stats`
- `POST /api/events/:id/register`
- `DELETE /api/events/:id/register`
- `GET /api/events/:id/my-progress`

ADMIN routes are mounted under `/api/admin/events` for event CRUD/lifecycle, challenge association/order, announcements, participants and statistics.

### Migration and security
Migration: the single fresh `20260924020000_sqlite_init` migration.

The init migration is create-only. It contains no reset, truncate, core-table
drop, or deletion of users/challenges/solves/XP/badges/notifications. The event
DELETE endpoint archives rather than physically deleting event data.

Existing CSRF/origin protection, authentication, ADMIN authorization, rate limiting, Zod validation, bounded pagination, parameterized Prisma/raw SQL queries and escaped frontend rendering are reused.

### Testing limitation
Static source checks can be run without a database server. Full Prisma
generation, migration execution, live event registration/scoring tests and
end-to-end regression require the project dependencies and a writable local
SQLite file; if that environment is unavailable, they must not be reported as
passed.

## Modification 7 — Advanced Security + Comprehensive Testing

Modification 7 is a hardening/audit pass over the complete application rather than a new feature phase. Existing Modifications 1–6 are preserved.

### Security fixes applied

- Reconfirmed server-side authentication/ADMIN/ownership checks across auth, challenges, hints/files/writeups, badges, community/social, notifications/activity and events.
- User event and Phase 7 routes require the existing authenticated session guard before controllers access `req.user`.
- Event leaderboard ranking now gives the same rank to users with equal event points and solve counts; last-solve time remains only a deterministic display tie-breaker.
- Open-event leaderboard totals now count both registered participants and qualifying event-window solvers, matching the actual participant set.
- Concurrent block creation now handles the database uniqueness race without returning a false server error.
- Production unknown-error responses are always generic; detailed exception messages/stacks are retained only in development logs.
- Production CORS rejects localhost/loopback origins and requires the configured `FRONTEND_URL` origin to be present in `CORS_ORIGIN`.
- Added `TRUST_PROXY=false` configuration. Enable it only when the application is behind a trusted reverse proxy; this keeps rate-limit/security-event client IP handling correct without trusting spoofed forwarding headers on direct deployments.
- Upgraded Express to the current 4.22.x line and Nodemailer to 10.0.10. Nodemailer 10 requires Node 20+, so the backend engine baseline is now Node `>=20.19.0`.
- Removed the obsolete `@types/nodemailer` dependency because Nodemailer 10 ships its own TypeScript declarations.

### Static security audit

A repeatable audit script is available as:

```text
backend/scripts/security-audit.mjs
```

Run with:

```text
npm run security:audit
```

The executed audit checked role constraints, unsafe SQL/shell/dynamic-code patterns, security middleware, cookie attributes, upload limits, protected Phase 7/Event routes, admin route guards, frontend escaping/navigation constraints, audited dependency versions, migration destructiveness, `.env` presence and obvious private-key files.

### Dependency findings

- `multer` is on `2.4.x`, which includes the recent multipart DoS fixes relevant to the application's upload path.
- `nodemailer` 6.10.1 was below the current supported security line. The application now targets `10.0.10`; this requires Node 20+.
- Express remains on the 4.x architecture and is updated to `4.22.1` without a framework redesign.
- Prisma, Zod, Helmet and the remaining dependencies were not blindly major-upgraded during this hardening pass.

### Testing performed in this environment

Passed:

- `node --check js/api.js`
- `node --check js/script.js`
- `node --check backend/scripts/security-audit.mjs`
- `node backend/scripts/security-audit.mjs` — 28/28 static security checks passed
- HTML duplicate-ID scan — 0 duplicates
- CSS brace/parenthesis balance checks
- destructive migration scan — 0 destructive migration files
- private-key literal scan — 0 hits
- package.json JSON validation
- `npx prisma validate`
- `npx prisma generate`
- `npx prisma migrate deploy` against a disposable local SQLite file
- `npx prisma db seed` against that file
- direct SQLite read/write proof for a user, category, challenge, solve, DateTime,
  Boolean, and `SELECT 1`
- `npm run type-check`

The production build and endpoint E2E suite are separate checks; run them in the
target environment and do not infer a pass from the SQLite proof.

### Live-test limitation

The following still require a target environment and are not claimed here:

- authentication E2E
- password reset/email verification E2E
- session expiry/revocation E2E
- USER vs ADMIN integration tests
- live IDOR/CSRF/XSS/injection endpoint tests
- challenge submission/duplicate solve/First Blood concurrency tests
- file upload/download runtime tests
- community/social integration tests
- event registration/capacity race/scoring/leaderboard tests
- gamification XP/streak/badge concurrency tests
- full application regression/E2E

No test in this report is represented as passed unless it was actually executed.

### Production requirements

- Use strong random `SESSION_SECRET` and `FLAG_HASH_SECRET` values.
- Use HTTPS and keep production session cookies Secure/HttpOnly/SameSite protected.
- Configure production `CORS_ORIGIN` explicitly and ensure it contains the `FRONTEND_URL` origin.
- Set `TRUST_PROXY=true` only behind a trusted reverse proxy/load balancer that overwrites forwarding headers correctly.
- Configure production SMTP credentials through environment variables only.
- Run the committed SQLite init migration with `npx prisma migrate deploy`;
  never use `prisma migrate reset` on deployed data.
- Use a shared Redis/rate-limit store for multi-instance deployment; current rate limiting remains intentionally single-process.
- Maintain backups and a tested restore procedure before production migration.
- Install dependencies from the updated `package.json`, then run Prisma generate, type-check and build before deployment.
