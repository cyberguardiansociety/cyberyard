#!/usr/bin/env node
/**
 * One-command local development launcher for CyberYardHub.
 *
 *   npm run dev
 *
 * Starts BOTH halves of the platform and keeps their lifetimes tied
 * together:
 *
 *   1. backend/.env is created from .env.example (with freshly generated
 *      SESSION_SECRET / FLAG_HASH_SECRET) if it doesn't exist yet;
 *   2. backend dependencies are installed if node_modules is missing;
 *   3. the Prisma client is generated if missing;
 *   4. committed migrations are applied with `prisma migrate deploy`
 *      (forward-only; never reset) — pass --skip-migrate to opt out;
 *   5. the API (tsx watch) and the static frontend server run as two
 *      children with prefixed output, and Ctrl+C shuts both down.
 *
 * The frontend port is derived from CORS_ORIGIN so the browser origin and
 * the API's allowed origin can never drift apart.
 */

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const BACKEND = path.join(ROOT, 'backend');
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const colors = {
  api: '[36m', // cyan
  web: '[35m', // magenta
  sys: '[90m', // grey
  err: '[31m', // red
  off: '[0m',
};

const skipMigrate = process.argv.includes('--skip-migrate') || process.env.CYH_SKIP_MIGRATE === '1';

function sys(msg) {
  console.log(`${colors.sys}[dev]${colors.off} ${msg}`);
}
function fail(msg, code = 1) {
  console.error(`${colors.err}[dev] ${msg}${colors.off}`);
  process.exit(code);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    // `quiet` swallows a probe command's output (used for the pre-flight
    // lock check) while still reporting its exit code.
    const { quiet, ...spawnOpts } = opts;
    const child = spawn(cmd, args, {
      cwd: BACKEND,
      stdio: quiet ? ['ignore', 'ignore', 'ignore'] : 'inherit',
      ...spawnOpts,
    });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))));
  });
}

/** Create backend/.env from the example with real random secrets. */
function ensureEnv() {
  const envPath = path.join(BACKEND, '.env');
  if (fs.existsSync(envPath)) return;
  const example = path.join(BACKEND, '.env.example');
  if (!fs.existsSync(example)) fail('backend/.env.example is missing.');
  const secrets = Array.from({ length: 2 }, () => crypto.randomBytes(48).toString('base64'));
  const content = fs
    .readFileSync(example, 'utf8')
    .replace('SESSION_SECRET=replace-with-a-long-random-value', `SESSION_SECRET=${secrets[0]}`)
    .replace('FLAG_HASH_SECRET=replace-with-a-different-long-random-value', `FLAG_HASH_SECRET=${secrets[1]}`);
  fs.writeFileSync(envPath, content, { mode: 0o600 });
  sys('created backend/.env with freshly generated secrets.');
  sys('set DATABASE_URL (and optionally SEED_ADMIN_EMAIL / SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD) before first run.');
}

/** First-run dependency install + Prisma client generation. */
async function ensureBackendReady() {
  if (!fs.existsSync(path.join(BACKEND, 'node_modules'))) {
    sys('installing backend dependencies (first run — this takes a minute)…');
    try {
      await run(NPM, ['install']);
    } catch {
      fail('backend dependency install failed.');
    }
  }
  if (!fs.existsSync(path.join(BACKEND, 'node_modules', '.prisma', 'client'))) {
    sys('generating Prisma client…');
    try {
      await run(NPM, ['exec', '--', 'prisma', 'generate']);
    } catch {
      fail('prisma generate failed — check backend/.env DATABASE_URL syntax.');
    }
  }
}

async function applyMigrations() {
  if (skipMigrate) {
    sys('skipping migrations (--skip-migrate).');
    return;
  }
  // Pre-flight: if a previous instance is still running, the SQLite file is
  // locked and `migrate deploy` fails with the famously unhelpful
  // "database is locked". Catch that here with an actionable message —
  // before the migration step — instead of a raw Prisma stack.
  if (fs.existsSync(path.join(BACKEND, 'prisma', 'dev.db'))) {
    sys('checking whether the database is already in use…');
    try {
      await run(NPM, ['exec', '--', 'prisma', 'migrate', 'status'], { quiet: true });
    } catch {
      fail(
        'The SQLite database is locked — another CyberYardHub instance is probably still running.\n' +
        '           Stop it (Ctrl+C in its terminal, or: fuser -k 4000/tcp) and run `npm run dev` again.',
      );
    }
  }
  sys('applying database migrations…');
  try {
    await run(NPM, ['exec', '--', 'prisma', 'migrate', 'deploy']);
  } catch {
    fail(
      'prisma migrate deploy failed. Is the database file writable and is DATABASE_URL in backend/.env set?\n' +
      '           Recommended: DATABASE_URL="file:./dev.db?connection_limit=1" (single writer connection — no lock errors).\n' +
      '           If the database is locked, stop any other running instance first (fuser -k 4000/tcp).',
    );
  }
}

/** Derive the frontend port from CORS_ORIGIN so both always agree. */
function frontendPort() {
  try {
    const envText = fs.readFileSync(path.join(BACKEND, '.env'), 'utf8');
    const match = envText.match(/^CORS_ORIGIN=(.+)$/m);
    const first = match?.[1]?.trim().replace(/^["']|["']$/g, '').split(',')[0];
    if (first) {
      const port = new URL(first).port;
      if (port) return Number(port);
    }
  } catch {
    /* fall through to the default */
  }
  return 5500;
}

/** The API port requested by backend/.env (PORT=...), defaulting to 4000. */
function configuredApiPort() {
  try {
    const envText = fs.readFileSync(path.join(BACKEND, '.env'), 'utf8');
    const match = envText.match(/^PORT=(.+)$/m);
    const port = Number(match?.[1]?.trim().replace(/^["']|["']$/g, ''));
    if (Number.isInteger(port) && port > 0 && port < 65536) return port;
  } catch {
    /* fall through to the default */
  }
  return 4000;
}

function isPortFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, host);
  });
}

/**
 * Resolve the API port, stepping forward when the configured one is taken.
 *
 * A busy port used to fail silently in a way that looked like broken auth:
 * the backend could not bind, so the frontend kept POSTing /api/auth/*
 * to whatever unrelated app owned that port and every login/register
 * attempt died with a CORS or "not allowed" error. Resolving the port up
 * front — and telling the frontend which one we actually got — removes
 * that whole failure mode.
 */
async function resolveApiPort(preferred, host = '127.0.0.1') {
  if (await isPortFree(preferred, host)) return { port: preferred, relocated: false };
  sys(`port ${preferred} is already in use by another application.`);
  for (let candidate = preferred + 1; candidate < preferred + 200; candidate += 1) {
    if (await isPortFree(candidate, host)) {
      sys(`relocating the CyberYardHub API to port ${candidate} (freed for this run).`);
      return { port: candidate, relocated: true };
    }
  }
  fail(`no free port found between ${preferred} and ${preferred + 200}.`);
}

/**
 * Publish the resolved API base to the frontend as a real static asset.
 *
 * Written as a file (not injected per-response) so it works no matter how
 * the site is served — scripts/serve-static.mjs, `python3 -m http.server`,
 * `npx serve`, or opened straight off the filesystem. js/api.js reads
 * window.CYBERYARDHUB_API_BASE_URL before it falls back to any default.
 */
function writeApiBaseFile(apiPort) {
  const target = path.join(ROOT, 'js', 'api-base.js');
  const contents = [
    '/* GENERATED by scripts/dev.mjs on every `npm run dev` — do not edit by hand.',
    '   Tells js/api.js which backend this local run is using. Committed with a',
    '   sensible default so the site also works when served by another tool. */',
    `window.CYBERYARDHUB_API_BASE_URL = 'http://localhost:${apiPort}/api';`,
    '',
  ].join('\n');
  fs.writeFileSync(target, contents, 'utf8');
}

/**
 * Wait for the API to answer, then confirm it is really CyberYardHub and
 * that the auth routes are mounted. Turns a silent "login does nothing"
 * into one explicit line in the terminal.
 */
async function verifyApi(apiPort, origin, timeoutMs = 60_000) {
  const base = `http://127.0.0.1:${apiPort}/api`;
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no response';

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    try {
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(4000) });
      const body = await res.json();
      if (res.ok && body && body.service === 'cyberyardhub-backend') {
        // A deliberately invalid register body must come back 400 from our
        // own Zod schema. Anything else means something else owns this port.
        const probe = await fetch(`${base}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin },
          body: JSON.stringify({ username: 'x' }),
          signal: AbortSignal.timeout(4000),
        });
        if (probe.status !== 400) {
          fail(
            `something on port ${apiPort} answers as CyberYardHub but rejects the auth schema ` +
              `(expected 400, got ${probe.status}). Stop that process and run \`npm run dev\` again.`,
          );
        }
        return true;
      }
      lastError = `unexpected /api/health payload (service=${body && body.service})`;
    } catch (err) {
      lastError = err && err.message ? err.message : String(err);
    }
  }
  fail(`the CyberYardHub API did not become healthy on port ${apiPort} (${lastError}).`);
}

/** Spawn a long-running child, prefixing every output line. */
function spawnLabeled(label, cmd, args, opts) {
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  const prefix = `${colors[label]}[${label}]${colors.off} `;
  for (const stream of [child.stdout, child.stderr]) {
    readline.createInterface({ input: stream }).on('line', (line) => process.stdout.write(`${prefix}${line}\n`));
  }
  return child;
}

async function main() {
  sys('starting CyberYardHub (API + frontend)…');
  ensureEnv();
  await ensureBackendReady();
  await applyMigrations();

  const webPort = frontendPort();
  const webHost = '127.0.0.1';
  const webOrigin = `http://localhost:${webPort}`;
  const { port: apiPort } = await resolveApiPort(configuredApiPort());
  writeApiBaseFile(apiPort);

  const api = spawnLabeled('api', NPM, ['run', 'dev'], { cwd: BACKEND, env: { ...process.env, PORT: String(apiPort) } });
  const web = spawnLabeled(
    'web',
    process.execPath,
    [path.join(HERE, 'serve-static.mjs'), '--root', ROOT, '--port', String(webPort), '--host', webHost],
    { cwd: ROOT },
  );

  console.log('');
  sys(`frontend  ${webOrigin}`);
  sys(`API       http://localhost:${apiPort}   (health: /api/health)`);
  sys('press Ctrl+C to stop both');
  console.log('');

  let shuttingDown = false;
  const stop = (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of [api, web]) {
      if (child.exitCode === null) child.kill('SIGTERM');
    }
    setTimeout(() => {
      for (const child of [api, web]) {
        if (child.exitCode === null) child.kill('SIGKILL');
      }
      process.exit(code);
    }, 2000).unref();
  };

  for (const [label, child] of [['API', api], ['frontend', web]]) {
    child.on('exit', (code, signal) => {
      if (shuttingDown) return;
      sys(`${label} process exited (${signal || `code ${code}`}) — stopping the other one.`);
      stop(code ?? 0);
    });
  }
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => stop(0));
  }

  // Prove the auth surface is actually mounted and reachable before telling
  // the user everything is ready — this is exactly the class of silent
  // failure that made registration look broken.
  try {
    await verifyApi(apiPort, webOrigin);
    sys(`auth routes verified on :${apiPort} · login and registration are reachable`);
  } catch (err) {
    stop(1);
    throw err;
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
