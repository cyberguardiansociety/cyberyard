# CyberYardHub

CyberYardHub is a secure CTF platform built with a Vanilla JS SPA, Node.js/TypeScript/Express, PostgreSQL and Prisma. The project has reached the final Modification 8 production/deployment polish phase.

## Final platform capabilities

Authentication, account security, challenges and secure flag validation, First Blood, leaderboards, hints/files/writeups, badges, XP/levels/streaks/achievements, notifications/activity, community/social/moderation, CTF events, admin controls and security hardening are preserved.

## Local development

1. Install Node.js 20.19+ and PostgreSQL.
2. Copy `backend/.env.example` to `backend/.env` and configure local values.
3. Configure PostgreSQL `DATABASE_URL`.
4. From `backend/`, run `npm.cmd install`, `npm.cmd run prisma:generate`, and `npm.cmd run prisma:migrate`.
5. Run `npm.cmd run dev`.
6. Serve the repository root as static files. Localhost/file development automatically falls back to the backend at port 4000; a custom API can still be supplied through the existing `cyberyardhub-api-base` meta tag or `window.CYBERYARDHUB_API_BASE_URL`.

## Production

Read [`DEPLOYMENT.md`](DEPLOYMENT.md) before deployment. Production requires HTTPS, explicit CORS, strong secrets, SMTP, PostgreSQL, and a safe migration/backup workflow.

## Verification

Run:

```text
cd backend
npm.cmd run security:audit
npm.cmd run type-check
npm.cmd run build
```

Only report a check as passed when it was actually executed. PostgreSQL, SMTP, browser and deployment checks depend on the target environment.

## Safety

Never run `prisma migrate reset`, `TRUNCATE`, or destructive database operations against a deployed CyberYardHub database.
