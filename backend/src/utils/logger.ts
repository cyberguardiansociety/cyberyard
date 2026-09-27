/**
 * Minimal leveled logger with local file logging + size-based rotation.
 *
 * Console output is unchanged from the original tiny logger (same format,
 * same stdout/stderr streams per level) — every call site keeps working:
 *   logger.info(message, meta?) / logger.warn(...) / logger.error(...)
 *
 * File logging: each line is appended to `<LOG_DIR>/app.log` (resolved
 * relative to process.cwd(); created recursively, fail-open — if any file
 * operation fails, the console output still happens and nothing throws).
 * Rotation is zero-dependency and synchronous: when the active file would
 * exceed LOG_FILE_MAX_BYTES, app.log is renamed to app.log.1 ... app.log.N
 * and the oldest (app.log.N) is deleted. Sync append is a deliberate
 * tradeoff: it serializes writes for free and is trivially correct at this
 * scale (a console logger's volume); if it ever showed up in profiles the
 * seam is `writeToFile` alone — swap in a serialized fs.promises queue.
 *
 * LOG_* vars are parsed here with zod (not via config/env) on purpose:
 * logging must stay usable when env validation fails (env.ts throws before
 * the app boots, and importing config/env would drag DATABASE_URL etc. into
 * logger-only tooling); invalid LOG_* values fall back to defaults with a
 * one-time console notice rather than crashing.
 *
 * LOG_LEVEL (debug|info|warn|error, default info): strictly enforced — a
 * message below the threshold is dropped from BOTH file and console (so
 * errors are silenced too if LOG_LEVEL were set above 'error'; with the
 * default 'info' everything this logger emits is visible, matching today).
 *
 * Structured extras: when meta is provided it is JSON-serialized onto the
 * same file line (`... message {"key":"value"}`), never allowed to throw —
 * circular or otherwise unserializable meta falls back to String(meta).
 * Console keeps passing the raw meta object through, exactly as before.
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

type ConsoleLevel = 'info' | 'warn' | 'error';
type LogLevel = 'debug' | ConsoleLevel;

const logEnvSchema = z.object({
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_DIR: z.string().min(1).default('logs'),
  LOG_FILE_MAX_BYTES: z.coerce.number().int().min(1024).default(5 * 1024 * 1024),
  LOG_FILE_MAX_FILES: z.coerce.number().int().min(1).max(100).default(5),
});

const parsedLogEnv = logEnvSchema.safeParse(process.env);
if (!parsedLogEnv.success) {
  // eslint-disable-next-line no-console
  console.error('⚠️ Invalid LOG_* environment variables — using logger defaults:');
  // eslint-disable-next-line no-console
  console.error(parsedLogEnv.error.flatten().fieldErrors);
}
const logEnv: z.infer<typeof logEnvSchema> = parsedLogEnv.success
  ? parsedLogEnv.data
  : { LOG_LEVEL: 'info', LOG_DIR: 'logs', LOG_FILE_MAX_BYTES: 5 * 1024 * 1024, LOG_FILE_MAX_FILES: 5 };

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const threshold = LEVEL_WEIGHT[logEnv.LOG_LEVEL];

const logDir = path.resolve(process.cwd(), logEnv.LOG_DIR);
const logFile = path.join(logDir, 'app.log');
let dirReady = false;
// In-memory size counter (initialized from disk once) so we don't pay a
// stat() per line; accurate for this single-process writer.
let activeBytes = -1;

function ensureDir(): boolean {
  if (dirReady) return true;
  try {
    fs.mkdirSync(logDir, { recursive: true });
    dirReady = true;
    try {
      activeBytes = fs.statSync(logFile).size;
    } catch {
      activeBytes = 0; // no active file yet
    }
    return true;
  } catch {
    dirReady = false;
    return false;
  }
}

function rotate(): void {
  try {
    const oldest = `${logFile}.${logEnv.LOG_FILE_MAX_FILES}`;
    fs.rmSync(oldest, { force: true });
    for (let i = logEnv.LOG_FILE_MAX_FILES - 1; i >= 1; i -= 1) {
      const from = `${logFile}.${i}`;
      if (fs.existsSync(from)) fs.renameSync(from, `${logFile}.${i + 1}`);
    }
    if (fs.existsSync(logFile)) fs.renameSync(logFile, `${logFile}.1`);
  } catch {
    // Rotation is best-effort: a rename hiccup must never break a request;
    // worst case the active file keeps growing until the next attempt.
  }
  activeBytes = 0;
}

function writeToFile(line: string): void {
  if (!ensureDir()) return; // fail-open: console output already happened
  const chunk = `${line}\n`;
  if (activeBytes >= 0 && activeBytes + Buffer.byteLength(chunk) > logEnv.LOG_FILE_MAX_BYTES) {
    rotate();
  }
  try {
    fs.appendFileSync(logFile, chunk, { encoding: 'utf8' });
    activeBytes += Buffer.byteLength(chunk);
  } catch {
    // Fail-open: disk full / permissions — keep serving, console has it.
  }
}

function serializeMeta(meta: unknown): string {
  // JSON.stringify turns Error into '{}' — flatten first so file logs keep
  // name/message/stack (console still receives the raw object).
  const value = meta instanceof Error
    ? { name: meta.name, message: meta.message, stack: meta.stack }
    : meta;
  try {
    const json = JSON.stringify(value);
    if (json !== undefined) return json;
    return String(value); // undefined/function/symbol
  } catch {
    try {
      return String(value); // circular or throwing toJSON
    } catch {
      return '[unserializable meta]';
    }
  }
}

function log(level: ConsoleLevel, message: string, meta?: unknown): void {
  if (LEVEL_WEIGHT[level] < threshold) return; // strict: drops file AND console

  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  writeToFile(meta !== undefined ? `${line} ${serializeMeta(meta)}` : line);

  if (meta !== undefined) {
    // eslint-disable-next-line no-console
    console[level === 'info' ? 'log' : level](line, meta);
  } else {
    // eslint-disable-next-line no-console
    console[level === 'info' ? 'log' : level](line);
  }
}

export const logger = {
  info: (message: string, meta?: unknown) => log('info', message, meta),
  warn: (message: string, meta?: unknown) => log('warn', message, meta),
  error: (message: string, meta?: unknown) => log('error', message, meta),
};
