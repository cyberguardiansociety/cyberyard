#!/usr/bin/env node
/**
 * Zero-dependency static file server for the CyberYardHub frontend.
 *
 * The frontend is a plain static site (index.html + css/ + js/) with no
 * bundler, so it only needs correct MIME types, traversal-safe path
 * resolution and a few defensive headers. Binding to loopback by default
 * keeps a local-first platform off the LAN unless explicitly asked.
 *
 *   node scripts/serve-static.mjs [--root <dir>] [--port <n>] [--host <h>]
 */

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ROOT = path.resolve(arg('root', path.join(HERE, '..')));
const PORT = Number(arg('port', process.env.FRONTEND_PORT || 5500));
const HOST = arg('host', '127.0.0.1');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  if (res.req.method === 'HEAD') res.end();
  else res.end(body);
}

function notFound(res) {
  send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
}

/**
 * Resolve a URL path to a file inside ROOT, or null when it escapes.
 * Rejects traversal, NUL bytes and symlinks pointing outside the root.
 */
async function resolveFile(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;

  let pathname = path.normalize(decoded);
  if (pathname === '/' || pathname === '\\') pathname = '/index.html';
  // An extensionless path maps to its .html sibling (e.g. /about).
  if (!path.extname(pathname)) pathname += '.html';

  const candidate = path.resolve(ROOT, `.${pathname.startsWith('/') ? pathname : `/${pathname}`}`);
  if (candidate !== ROOT && !candidate.startsWith(ROOT + path.sep)) return null;

  try {
    const [realRoot, realFile] = await Promise.all([fsp.realpath(ROOT), fsp.realpath(candidate)]);
    if (realFile !== realRoot && !realFile.startsWith(realRoot + path.sep)) return null;
    const stat = await fsp.stat(realFile);
    if (!stat.isFile()) return null;
    return { file: realFile, stat };
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method not allowed', { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    return;
  }

  const urlPath = (req.url || '/').split('?')[0].split('#')[0];
  const found = await resolveFile(urlPath);
  if (!found) {
    notFound(res);
    return;
  }

  const type = MIME[path.extname(found.file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': found.stat.size,
    // Development host: never cache, so edits show up on reload.
    'Cache-Control': 'no-store',
    // Defense in depth for the static host (the app also sets a CSP meta
    // and Helmet sets these on API responses).
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(found.file)
    .on('error', () => {
      if (!res.headersSent) notFound(res);
      else res.destroy();
    })
    .pipe(res);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`port ${PORT} is already in use — stop the other process or pass --port <n>.`);
  } else {
    console.error('static server error:', err.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  // No [web] prefix here: scripts/dev.mjs already labels this process's
  // output. Run standalone (npm run dev:web) these lines still read fine.
  console.log(`serving ${ROOT}`);
  console.log(`→ http://${HOST}:${PORT}`);
});
