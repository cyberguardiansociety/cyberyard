# CyberYardHub Production Deployment

This is the final deployment guide for Modification 8. It preserves the existing Node.js + Express + Prisma + SQLite backend and static SPA frontend.

## Architecture

```text
Internet
   ↓ HTTPS reverse proxy (Nginx)
   ├── /          → static CyberYardHub frontend
   └── /api/*     → CyberYardHub backend :4000
                         ↓
              local SQLite file (backend/prisma/dev.db)
                         ↓
              Redis (optional/recommended for multi-instance rate limits)
```

`TRUST_PROXY=true` is appropriate only when a trusted reverse proxy overwrites forwarding headers. Keep it `false` for direct deployments.

## Requirements

- Node.js 20.19+
- A writable local filesystem for the SQLite database file; no database server
  needs to be installed or run
- SMTP account for password-reset/email-verification/security mail
- HTTPS in production
- Optional shared Redis architecture for multi-instance deployments

## Environment

Copy `backend/.env.example` to `backend/.env` and replace every placeholder. Production requires:

- `NODE_ENV=production`
- strong, different `SESSION_SECRET` and `FLAG_HASH_SECRET` values (32+ characters; cryptographically random is recommended)
- SQLite `DATABASE_URL` such as `file:./dev.db?connection_limit=1`
- HTTPS `FRONTEND_URL`
- matching HTTPS `CORS_ORIGIN`
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `TRUST_PROXY=true` only when actually behind a trusted proxy

Generate secrets, for example:

```text
openssl rand -base64 48
```

Never commit `.env`, embed secrets in images, or store secrets beside public backups.

## Installation and build

```text
cd backend
npm.cmd install
npm.cmd run prisma:generate
npx prisma migrate deploy
npm.cmd run type-check
npm.cmd run build
npm.cmd run security:audit
```

The database is a local SQLite file, so there is no database service to install
or start. The deployed file must already have a backup strategy. Apply the
committed fresh-schema migration with `npx prisma migrate deploy`; do not use
`prisma migrate reset` against production. Upgrades from an existing
PostgreSQL deployment are intentionally unsupported: start with a new SQLite
file.

## Start

```text
cd backend
npm.cmd start
```

The server listens on `PORT` (default 4000). It does not reset or seed production data at startup.

## Health checks

- Liveness: `GET /api/health`
- Readiness: `GET /api/health/ready`

Readiness returns HTTP 503 when the local SQLite database cannot answer a
trivial query. Neither endpoint exposes credentials, connection strings,
secrets, or filesystem paths.

## SMTP

SMTP credentials are environment variables only. Reset and verification links are built from `FRONTEND_URL` and carry opaque tokens in the URL fragment. Configure SMTP before enabling account recovery in production. No real mail delivery is performed by this repository's deployment checks.

## File storage

Challenge files remain outside public static serving and use the existing UUID/path validation, extension/MIME/signature and authorization controls. If local `backend/storage/` is used, persist and back it up separately from the application itself (keep it outside any synced/rebuilt directory). A future object-storage migration is intentionally outside this final modification.

## Backups

Back up the SQLite database file before schema migrations and retain tested
restore procedures. With WAL enabled, stop the backend or checkpoint before
copying so the main file and its `-wal`/`-shm` sidecars are consistent. Back up
challenge-file storage separately. Keep environment secrets in a dedicated
secret-management system or protected secret store, never in public backup
archives. This documentation does not claim that a backup or restore was
executed.

A simple file-level backup (adapt the path to `DATABASE_URL`) is:

```text
cp prisma/dev.db backups/cyberyardhub-YYYYMMDD.db
```

## Nginx / HTTPS

See `deploy/nginx.example.conf`. It redirects HTTP to HTTPS, serves the static SPA, proxies `/api/` to the backend, sets forwarding headers, caps request bodies at 10 MB, and denies common secret/backup extensions. Replace certificate paths and `example.com` with the real deployment values.

## Rate limiting

Modification 7's in-memory rate limits remain the current architecture. They are suitable for a single backend process. Multi-instance production should use a shared Redis-backed rate-limit/session architecture before scaling horizontally. Redis is therefore documented as recommended rather than silently introduced as a new runtime dependency.

## Graceful shutdown

The backend handles `SIGTERM` and `SIGINT`, stops accepting new connections, waits for the HTTP server to close, disconnects Prisma, and has a bounded 15-second shutdown timeout.

## Operational checklist

- [ ] Production secrets configured and different
- [ ] SQLite file path writable and database file backed up
- [ ] SMTP configured
- [ ] HTTPS certificate configured
- [ ] CORS/FRONTEND_URL match
- [ ] TRUST_PROXY matches actual topology
- [ ] `npm run prisma:generate` completed
- [ ] migrations applied safely
- [ ] `npm run type-check` completed
- [ ] `npm run build` completed
- [ ] `npm run security:audit` completed
- [ ] `/api/health` checked
- [ ] `/api/health/ready` checked
- [ ] smoke/regression suite completed in a real environment
- [ ] SQLite backup/restore procedure tested
- [ ] challenge-file persistence/backup verified
- [ ] logging collection configured
- [ ] multi-instance rate-limit decision documented

## Known limitations

The current repository does not add a Redis client, external object storage, managed logging service, or automated background scheduler. These are deliberate non-invasive choices for the final polish phase.

## Modification 8 verification status

Executed in the available environment:

- `node --check js/api.js`
- `node --check js/script.js`
- `node --check backend/scripts/security-audit.mjs`
- `node backend/scripts/security-audit.mjs` — 28/28 passed
- HTML duplicate-ID/accessibility-name scan — no duplicates and no unnamed form controls found
- CSS brace/parenthesis balance — balanced
- no-reload/full-page-navigation scan — no matches
- migration destructive-operation scan — no DROP/TRUNCATE matches
- obvious secret/private-key scan — no findings
- `npm run type-check` — passed after the coordinated source migration
- Prisma validate/generate, fresh SQLite migration deploy, seed, and direct
  SQLite CRUD/storage-format proof — passed against a disposable local file

The following broader deployment checks still require the target environment and
must not be inferred from the local SQLite migration/seed proof:

- production build/start
- database-backed smoke/regression tests
- real SMTP delivery
- real HTTPS/reverse-proxy verification
- browser-based visual/accessibility/responsive verification

These are environment limitations, not claimed passes.

### Generated distribution note

The repository includes a checked-in `backend/dist/` distribution, but it may
not reflect the current source after a database-layer change. Run a fresh
`npm run build` and verify its exit status before deployment; this document
does not claim that the checked-in distribution is a successful production
build.
