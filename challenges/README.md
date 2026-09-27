# Challenge processes

Each vulnerable challenge runs as its own **plain process** on its own
**dedicated localhost port** — independently started, independently
resettable, with its own state directory. No containers, no shared state,
no shared database. This document is the contract.

## Directory convention

```text
source/challenges/<slug>/
  ...            # the challenge's own files (server, templates, flag, …)
  state/         # mutable per-challenge state (created on demand)
```

- `<slug>` matches the registry slug pattern `^[a-z0-9-]{1,64}$` (e.g.
  `echo-chamber`, `web-echo-1`).
- One directory = one challenge = one process. State never crosses between
  challenge directories.
- See `echo-chamber/` for the reference implementation (Node.js
  `node:http`, no external dependencies): `node server.js` starts it.

## Ports

- Every challenge binds its own dedicated port on **loopback only**
  (`127.0.0.1`), e.g. `3001`, `3002`, … — never a port already used by the
  platform (frontend static server `5500`, backend `4000`).
- The loopback bind is part of the isolation: a challenge is reachable
  only from this machine unless an operator deliberately rebinds it.
- Pick one unused port per challenge and keep it consistent with the
  registry entry (below).

## Isolation rules (hard requirements)

1. **No database access.** Challenges are started WITHOUT any platform
   environment: no `DATABASE_URL`, no session/flag secrets, no `.env`.
   They have no PostgreSQL client and no credentials, so there is no path
   — network or otherwise — from a challenge to platform data. The backend
   only listens on `127.0.0.1:4000` in local deployments, and a challenge
   is granted nothing that would authenticate it there.
2. **Only registry-mediated communication.** The platform talks to a
   challenge exclusively through the proxy in
   `backend/src/services/instance.service.ts`, driven by
   `backend/challenge.registry.json` (see "Registering a challenge"
   below). User input can never select an arbitrary host/port — SSRF is
   blocked structurally: outbound requests only ever target registry-
   defined `baseUrl`s.
3. **Challenge → platform is limited.** A challenge holds no platform
   credentials, and the proxy never forwards `Set-Cookie` back to
   browsers, so a challenge can never touch the platform session.
4. **Unprivileged, filesystem-scoped.** Run challenges as a regular user;
   a challenge may only write inside its own state directory.

## HTTP contracts

Every challenge must implement both:

| Requirement | Contract |
|---|---|
| Health  | `GET /health` → `200` with JSON (`{"status":"ok",...}`) while the process is up |
| Reset   | `POST /__reset` → clears ALL of the challenge's mutable state, responds `200` with JSON (e.g. `{"reset":true,"cleared":N}`) |

Both are called by the platform proxy with a 10-second timeout; instances
that do not answer are reported as `down`.

## File storage & cleanup

- Mutable state lives only in the per-challenge state directory (the
  sample uses `challenges/echo-chamber/state/`, overridable via
  `STATE_DIR`). Persistent challenge data (profiles, counters, scratch
  files) must go there and nowhere else.
- **Automatic cleanup/reset**: `POST /__reset` must delete everything in
  that directory (the sample wipes it on every call), giving every
  participant a fresh instance. Killing and restarting the process yields
  the same guarantee if the state dir is wiped at start.
- The platform's own `backend/storage/` (challenge upload files) is
  separate and never readable/writable by a challenge process.
- Flags ship as a file inside the challenge directory (sample: `flag`)
  and are compared in the handler — challenges read flags from files, not
  from a shared DB.

## Registering a new challenge

1. Create `source/challenges/<slug>/` with a server implementing the
   health/reset contracts above.
2. Start it on its own loopback port, e.g.:
   ```sh
   node challenges/my-chal/server.js            # PORT=3001 default
   ```
3. Register it in `backend/challenge.registry.json`:
   ```json
   {
     "slug": "my-chal-1",
     "name": "My Challenge",
     "baseUrl": "http://127.0.0.1:3002",
     "healthPath": "/health",
     "resetPath": "/__reset",
     "enabled": true
   }
   ```
4. Restart the backend — the registry is read and zod-validated once per
   process (same restart-to-reload model as the rest of the static config).
   A missing/empty/invalid registry file simply disables the feature.
5. `"enabled": false` keeps the entry visible but skips all health/reset
   traffic.

## Platform API (what the frontend calls)

- `GET /api/instances` — every registry entry + live health
  (`status: healthy | down | disabled`), authenticated users.
  → `{ "instances": [ { "slug", "name", "status", "httpStatus"?, "latencyMs"?, "error"? } ] }`
- `GET /api/instances/:slug/status` — one instance's health:
  → `{ "slug", "name", "status", "httpStatus"?, "latencyMs"?, "error"? }`
  (404 `INSTANCE_NOT_FOUND` for unknown slugs)
- `POST /api/instances/:slug/reset` — proxied `POST /__reset`; forwards
  the challenge's own status + JSON/text body (1 MiB cap, `no-store`),
  `503 INSTANCE_DOWN` when unreachable, `5/min` per user.
- `GET /api/admin/instances` — all entries incl. `baseUrl`/`enabled` +
  health, administrators.
- `POST /api/admin/instances/:slug/reset` — administrator reset (same
  response contract as the user route).
