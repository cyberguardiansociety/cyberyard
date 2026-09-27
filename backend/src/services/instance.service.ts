import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';

/**
 * Challenge instance registry + the platform→challenge HTTP proxy.
 *
 * Registry file selection (single, simple mechanism — see also
 * source/challenges/README.md):
 *
 *   The loader always reads `challenge.registry.json` resolved relative to
 *   the compiled/source file itself — i.e. the backend root (`backend/`
 *   when running `npm run dev` from a checkout, the same directory for a
 *   built deployment). Each registered challenge is a separate process
 *   listening on its own dedicated localhost port, so every baseUrl points
 *   at `http://127.0.0.1:<port>`. No environment variable or config-schema
 *   change is involved; a missing, empty, or invalid file simply disables
 *   the feature (every endpoint reports an empty registry) — graceful by
 *   design so the platform boots with zero challenge processes running.
 *
 * SSRF protection (read before touching this file): outbound requests go
 * ONLY to registry-defined baseUrls. User input never selects a host or
 * port — a request can at most choose a registry slug (validated against
 * ^[a-z0-9-]{1,64}$), and the path appended to the origin comes from the
 * same operator-controlled registry entry, re-validated in
 * `resolveChallengeUrl` (no `..`, no `@`/userinfo, no scheme smuggling,
 * percent-encoded segments, capped total length). Redirects are refused so
 * a challenge cannot bounce the proxy onto another host. This service never
 * execs anything: reset is an HTTP POST to the registry `resetPath`.
 */

const REGISTRY_PATH = path.resolve(__dirname, '..', '..', 'challenge.registry.json');

/** Whole-proxy timeout: every registry call is bounded by this. */
const FETCH_TIMEOUT_MS = 10_000;
/** Cap on proxied response bodies — a challenge must not be able to push
 *  arbitrary amounts of data through the platform API.1 MiB. */
const MAX_UPSTREAM_BYTES = 1024 * 1024;
/** Cap on the outbound request path length. */
const MAX_TARGET_PATH_LENGTH = 512;

const slugSchema = z.string().regex(/^[a-z0-9-]{1,64}$/, 'invalid slug');
const registryPathSchema = z
  .string()
  .min(1)
  .max(MAX_TARGET_PATH_LENGTH)
  .regex(/^\/[A-Za-z0-9._~/-]*$/, 'path must start with / and contain only simple segments');

const registryEntrySchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(120),
  baseUrl: z
    .string()
    .url()
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          (url.protocol === 'http:' || url.protocol === 'https:') &&
          !url.username &&
          !url.password &&
          (url.pathname === '' || url.pathname === '/') &&
          !url.search &&
          !url.hash
        );
      } catch {
        return false;
      }
    }, 'baseUrl must be an http(s) origin without credentials, path, query, or fragment'),
  healthPath: registryPathSchema,
  resetPath: registryPathSchema,
  enabled: z.boolean(),
});

const registrySchema = z
  .array(registryEntrySchema)
  .superRefine((entries, ctx) => {
    const seen = new Set<string>();
    for (const entry of entries) {
      if (seen.has(entry.slug)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate slug: ${entry.slug}` });
      }
      seen.add(entry.slug);
    }
  });

export interface ChallengeInstance {
  slug: string;
  name: string;
  baseUrl: string;
  healthPath: string;
  resetPath: string;
  enabled: boolean;
}

export type InstanceHealth = 'healthy' | 'down' | 'disabled';

export interface InstanceStatus {
  slug: string;
  name: string;
  status: InstanceHealth;
  httpStatus?: number;
  latencyMs?: number;
  /** Short, sanitized diagnostic — never a stack trace. */
  error?: string;
}

export interface UpstreamResponse {
  status: number;
  contentType: string;
  bodyText: string;
}

let cachedRegistry: ChallengeInstance[] | null = null;

/**
 * Loads and zod-validates the registry on first use, then caches it for the
 * lifetime of the process (an operator edits the file, then restarts — same
 * model as the rest of the static config). Missing/empty/malformed file =>
 * feature disabled (empty registry), never a crash.
 */
export function getRegistry(): ChallengeInstance[] {
  if (cachedRegistry) return cachedRegistry;

  let raw: string;
  try {
    raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT') {
      logger.warn('Challenge registry unreadable — instance feature disabled', { code });
    }
    cachedRegistry = [];
    return cachedRegistry;
  }

  if (!raw.trim()) {
    logger.info('Challenge registry empty — instance feature disabled');
    cachedRegistry = [];
    return cachedRegistry;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    logger.warn('Challenge registry is not valid JSON — instance feature disabled');
    cachedRegistry = [];
    return cachedRegistry;
  }

  const parsed = registrySchema.safeParse(parsedJson);
  if (!parsed.success) {
    logger.warn('Challenge registry failed validation — instance feature disabled', {
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    });
    cachedRegistry = [];
    return cachedRegistry;
  }

  cachedRegistry = parsed.data;
  return cachedRegistry;
}

/** Every registry entry, enabled or not (callers surface `enabled`). */
export function listInstances(): ChallengeInstance[] {
  return getRegistry().map((entry) => ({ ...entry }));
}

/** Looks up one entry. Unknown or malformed slugs are indistinguishable 404s. */
export function getInstance(slug: string): ChallengeInstance {
  if (!slugSchema.safeParse(slug).success) {
    throw new ApiError(404, 'Challenge instance not found', 'INSTANCE_NOT_FOUND');
  }
  const entry = getRegistry().find((candidate) => candidate.slug === slug);
  if (!entry) {
    throw new ApiError(404, 'Challenge instance not found', 'INSTANCE_NOT_FOUND');
  }
  return entry;
}

/**
 * Builds the final outbound URL. Host/port are taken verbatim from the
 * registry baseOrigin; only path segments (from the registry entry) are
 * appended, each percent-encoded, with `..`, `@`, backslashes, NUL and
 * scheme-shaped prefixes rejected outright so nothing can be smuggled into
 * authority or escape the challenge's own paths.
 */
export function resolveChallengeUrl(baseUrl: string, subPath: string): string {
  const url = new URL(baseUrl);
  const invalidRegistry = (detail: string): ApiError =>
    new ApiError(500, `Invalid challenge registry entry: ${detail}`, 'INSTANCE_REGISTRY_INVALID');

  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw invalidRegistry('scheme');
  if (url.username || url.password) throw invalidRegistry('credentials in baseUrl');
  if (url.pathname !== '' && url.pathname !== '/') throw invalidRegistry('baseUrl must be an origin');
  if (url.search || url.hash) throw invalidRegistry('baseUrl must not carry query/fragment');

  if (subPath.includes('..') || subPath.includes('@') || subPath.includes('\\') || subPath.includes('\0')) {
    throw invalidRegistry('unsafe path segment');
  }
  // Reject scheme-shaped input like `https://evil` before it is encoded.
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(subPath)) throw invalidRegistry('scheme-like path');

  const segments = subPath.split('/').filter((segment) => segment.length > 0);
  const pathname = `/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
  if (pathname.length > MAX_TARGET_PATH_LENGTH) throw invalidRegistry('path too long');

  url.pathname = pathname;
  return url.toString();
}

async function readBodyCapped(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_UPSTREAM_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new ApiError(502, 'Challenge response exceeded the 1 MiB proxy cap', 'UPSTREAM_TOO_LARGE');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Bounded fetch against a registry-derived URL. Node 20 global fetch has no
 * cookie jar: no platform session cookie is ever attached to the challenge
 * request, and responses never come back with the platform's cookies.
 * `redirect: 'error'` keeps the connection on the registry origin.
 */
async function fetchUpstream(url: string, method: 'GET' | 'POST'): Promise<UpstreamResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      redirect: 'error',
      headers: { Accept: 'application/json, text/plain;q=0.9, */*;q=0.1' },
    });
    const bodyText = await readBodyCapped(res);
    return {
      status: res.status,
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
      bodyText,
    };
  } finally {
    clearTimeout(timer);
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
    return `no response within ${FETCH_TIMEOUT_MS}ms`;
  }
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, 200);
}

/** Live health check for one instance; never throws (timeouts report `down`). */
export async function getInstanceStatus(instance: ChallengeInstance): Promise<InstanceStatus> {
  if (!instance.enabled) {
    return { slug: instance.slug, name: instance.name, status: 'disabled' };
  }

  const startedAt = Date.now();
  try {
    const url = resolveChallengeUrl(instance.baseUrl, instance.healthPath);
    const upstream = await fetchUpstream(url, 'GET');
    const healthy = upstream.status >= 200 && upstream.status < 400;
    return {
      slug: instance.slug,
      name: instance.name,
      status: healthy ? 'healthy' : 'down',
      httpStatus: upstream.status,
      latencyMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      slug: instance.slug,
      name: instance.name,
      status: 'down',
      latencyMs: Date.now() - startedAt,
      error: describeError(err),
    };
  }
}

/** Health for every registry entry (disabled entries are never fetched). */
export async function listInstanceStatuses(): Promise<InstanceStatus[]> {
  return Promise.all(listInstances().map((instance) => getInstanceStatus(instance)));
}

/**
 * Resets one instance by POSTing to its registry resetPath — over HTTP, never
 * shell exec. Throws 403 for disabled instances and 503 when the challenge is
 * unreachable/timeout; otherwise the upstream status/body is forwarded by the
 * caller. Network-level failures become INSTANCE_DOWN here so ApiError from
 * the proxy cap propagates unchanged.
 */
export async function proxyInstanceReset(instance: ChallengeInstance): Promise<UpstreamResponse> {
  if (!instance.enabled) {
    throw new ApiError(403, 'This challenge instance is disabled', 'INSTANCE_DISABLED');
  }
  const url = resolveChallengeUrl(instance.baseUrl, instance.resetPath);
  try {
    return await fetchUpstream(url, 'POST');
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(503, 'Challenge instance is unreachable', 'INSTANCE_DOWN');
  }
}
