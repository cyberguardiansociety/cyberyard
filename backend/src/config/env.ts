import 'dotenv/config';
import { z } from 'zod';

/**
 * Optional string env vars are commonly shipped BLANK in .env files
 * (that's exactly what .env.example does for the SMTP block: leave unset
 * until you configure a local relay). dotenv hands those to us as an
 * empty string, which `z.string().min(1).optional()` rejects — so an
 * untouched example file would block boot. Normalize blank/whitespace to
 * undefined first, then apply the normal optional-string rules.
 */
const optionalString = (schema: z.ZodTypeAny = z.string()) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional(),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5500').refine((value) => {
    const origins = value.split(',').map((origin) => origin.trim()).filter(Boolean);
    if (origins.length === 0 || origins.includes('*')) return false;
    return origins.every((origin) => {
      try {
        const url = new URL(origin);
        return (url.protocol === 'http:' || url.protocol === 'https:') && !url.pathname.replace(/\/$/, '') && !url.search && !url.hash;
      } catch { return false; }
    });
  }, 'CORS_ORIGIN must contain one or more explicit HTTP(S) origins and must not use *'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (SQLite form: file:./dev.db)'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters — generate one with `openssl rand -base64 48`'),
  SESSION_COOKIE_NAME: z.string().default('cyh_session'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(7),
  SESSION_TTL_REMEMBER_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  REDIS_URL: optionalString(),
  FLAG_HASH_SECRET: z.string().min(16, 'FLAG_HASH_SECRET must be at least 16 characters — generate one with `openssl rand -base64 48`'),

  // Authentication email delivery. SMTP is optional in local development so
  // the existing project can still boot; production requires it explicitly.
  FRONTEND_URL: z.string().url().default('http://localhost:5500'),
  SMTP_HOST: optionalString(z.string().min(1)),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  SMTP_USER: optionalString(z.string().min(1)),
  SMTP_PASS: optionalString(z.string().min(1)),
  SMTP_FROM: optionalString(z.string().email()),
  // Offline-first email: master switch for outbound email. false => every
  // send is skipped (no transport created, no SMTP_* required — even in
  // production; see services/email.service.ts and the production block below).
  EMAIL_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  // See app.ts: enable only behind a trusted reverse proxy that overwrites
  // X-Forwarded-For; IP-keyed rate limiters depend on req.ip being truthful.
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid or missing environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error('Environment validation failed. Check your .env file against .env.example.');
}

/**
 * Loopback-origin twins.
 *
 * `localhost` and `127.0.0.1` are the SAME machine, but browsers treat them
 * as different origins — so a platform configured with only one of them
 * rejects every write from the other with a CORS/CSRF failure that surfaces
 * in the UI as "Unable to reach the server". For a local-first platform both
 * spellings are equally safe, so whenever a configured origin points at
 * loopback we allow its twin too. This stays fully explicit (no wildcards)
 * and only ever applies to localhost/127.0.0.1/[::1] on the same port.
 * Non-loopback origins (a LAN address, a real domain) are never touched.
 */
function loopbackTwin(origin: string): string | null {
  const twins: Record<string, string> = {
    localhost: '127.0.0.1',
    '127.0.0.1': 'localhost',
    '[::1]': 'localhost',
  };
  try {
    const url = new URL(origin);
    const twin = twins[url.hostname];
    if (!twin) return null;
    url.hostname = twin;
    return url.origin;
  } catch {
    return null;
  }
}

const configuredOrigins = parsed.data.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);
const allowedOrigins = Array.from(
  new Set(configuredOrigins.flatMap((origin) => [origin, loopbackTwin(origin)].filter((value): value is string => value !== null))),
);

export const env = { ...parsed.data, CORS_ORIGIN: allowedOrigins.join(',') };

if (env.NODE_ENV === 'production') {
  const insecureDefaults = new Set([
    'replace-with-a-long-random-value',
    'replace-with-a-different-long-random-value',
    'replace-with-a-long-random-value-generated-with-openssl',
  ]);
  if (insecureDefaults.has(env.SESSION_SECRET) || insecureDefaults.has(env.FLAG_HASH_SECRET)) {
    throw new Error('Production secrets must be replaced with cryptographically random values.');
  }
  if (env.SESSION_SECRET.length < 32 || env.FLAG_HASH_SECRET.length < 32) {
    throw new Error('Production SESSION_SECRET and FLAG_HASH_SECRET must each be at least 32 characters.');
  }
  if (env.SESSION_SECRET === env.FLAG_HASH_SECRET) {
    throw new Error('Production SESSION_SECRET and FLAG_HASH_SECRET must be different values.');
  }
  // The platform is local-first and uses a SQLite file. Keep the required
  // DATABASE_URL validation provider-aware instead of retaining PostgreSQL
  // credential/TLS checks that cannot apply to a file URL.
  if (/placeholder|user:pass@|changeme|change[-_ ]?me/i.test(env.DATABASE_URL)) {
    throw new Error('Production DATABASE_URL must not contain placeholder values.');
  }
  if (!/^file:/i.test(env.DATABASE_URL)) {
    throw new Error('Production DATABASE_URL must be a SQLite file URL (for example file:./dev.db).');
  }
  const productionOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (productionOrigins.some((origin) => /^https?:\/\/localhost(?::\d+)?$/i.test(origin) || /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin))) {
    throw new Error('Production CORS_ORIGIN must not contain localhost or loopback origins.');
  }
  let frontendOrigin: string;
  try {
    frontendOrigin = new URL(env.FRONTEND_URL).origin;
  } catch {
    throw new Error('FRONTEND_URL must be a valid URL.');
  }
  if (!productionOrigins.includes(frontendOrigin)) {
    throw new Error('FRONTEND_URL origin must be included in production CORS_ORIGIN.');
  }
  if (!frontendOrigin.startsWith('https://')) {
    throw new Error('Production FRONTEND_URL must use HTTPS.');
  }
  if (productionOrigins.some((origin) => !origin.startsWith('https://'))) {
    throw new Error('Production CORS_ORIGIN entries must use HTTPS.');
  }
  // Email is offline-first/optional in the stack: the hard SMTP requirement
  // applies only when EMAIL_ENABLED=true. With email disabled, production
  // boots without SMTP_* and sends are skipped (services/email.service.ts).
  if (env.EMAIL_ENABLED) {
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) {
      throw new Error('Production email delivery requires SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM (or set EMAIL_ENABLED=false).');
    }
    if (!env.SMTP_SECURE && env.SMTP_PORT !== 465 && env.SMTP_PORT !== 587) {
      throw new Error('Production SMTP must use implicit TLS (SMTP_SECURE=true) or a STARTTLS-capable port (465/587).');
    }
  }
}
