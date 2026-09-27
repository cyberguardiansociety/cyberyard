#!/usr/bin/env node
/**
 * Echo Chamber — sample isolated CyberYardHub challenge.
 *
 * A self-contained challenge that runs as a PLAIN PROCESS on its own
 * dedicated localhost port (no containers involved). It demonstrates the
 * contract documented in source/challenges/README.md:
 *
 *   * GET  /health  -> 200 {"status": "ok", ...}   (liveness contract)
 *   * POST /__reset -> wipes this challenge's state dir, returns JSON
 *   * everything else is the challenge itself (echo + flag-check toy).
 *
 * Isolation design points:
 *
 *   * binds to 127.0.0.1 by default — reachable only from this machine, so
 *     the challenge is never accidentally exposed on the LAN;
 *   * the flag is read from its own file (FLAG_FILE, default ./flag next to
 *     this script) and compared inside the request handler — challenges
 *     never touch the platform database;
 *   * mutable per-challenge state lives only in STATE_DIR (default ./state
 *     next to this script) which /__reset wipes clean;
 *   * no database client, no platform credentials, Node standard library
 *     only.
 *
 * Run it directly:
 *
 *     node server.js                       # 127.0.0.1:3001, state in ./state
 *     PORT=3002 node server.js             # a second challenge instance
 *
 * then register it in backend/challenge.registry.json.
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const HERE = __dirname;

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3001);
const STATE_DIR = process.env.STATE_DIR || path.join(HERE, 'state');
const FLAG_FILE = process.env.FLAG_FILE || path.join(HERE, 'flag');
const MAX_BODY_BYTES = 64 * 1024;
const MAX_ECHO_LENGTH = 2048;

const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Echo Chamber</title>
</head>
<body>
  <h1>Echo Chamber</h1>
  <p>A tiny self-contained challenge: the counter below is stored in this
     challenge's state directory and is wiped by <code>POST /__reset</code>.</p>
  <form action="/echo" method="get">
    <input name="text" placeholder="say something" maxlength="2048">
    <button type="submit">Echo</button>
  </form>
  <p><a href="/health">/health</a> &middot; <a href="/echo?text=hello">sample echo</a></p>
</body>
</html>
`;

function readFlag() {
  try {
    return fs.readFileSync(FLAG_FILE, 'utf8').trim();
  } catch {
    return '';
  }
}

function bumpCounter() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const counterFile = path.join(STATE_DIR, 'echo_count.txt');
  let count = 1;
  try {
    const parsed = Number.parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10);
    if (Number.isFinite(parsed)) count = parsed + 1;
  } catch {
    count = 1;
  }
  fs.writeFileSync(counterFile, String(count), 'utf8');
  return count;
}

function resetState() {
  /** Wipe per-challenge state. Returns the number of entries cleared. */
  let cleared = 0;
  try {
    for (const entry of fs.readdirSync(STATE_DIR)) {
      try {
        fs.rmSync(path.join(STATE_DIR, entry), { recursive: true, force: true });
        cleared += 1;
      } catch {
        continue;
      }
    }
  } catch {
    // State dir does not exist yet — nothing to clear.
  }
  fs.mkdirSync(STATE_DIR, { recursive: true });
  return cleared;
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendHtml(res, html) {
  const body = Buffer.from(html, 'utf8');
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': body.length,
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    const length = Number.parseInt(req.headers['content-length'] || '0', 10);
    if (!Number.isFinite(length) || length <= 0) {
      resolve(Buffer.alloc(0));
      return;
    }
    if (length > MAX_BODY_BYTES) {
      resolve(Buffer.alloc(0));
      return;
    }
    const chunks = [];
    let received = 0;
    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });
}

function timingSafeStringEqual(a, b) {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (req.method === 'GET') {
    if (pathname === '/health') {
      // Liveness contract: HTTP 200 + JSON while the process is up.
      sendJson(res, 200, { status: 'ok', challenge: 'echo-chamber' });
      return;
    }
    if (pathname === '/' || pathname === '/index.html') {
      sendHtml(res, INDEX_HTML);
      return;
    }
    if (pathname === '/echo') {
      const text = (url.searchParams.get('text') || '').slice(0, MAX_ECHO_LENGTH);
      const count = bumpCounter();
      sendJson(res, 200, { echo: text, count });
      return;
    }
    sendJson(res, 404, { error: 'not found' });
    return;
  }

  if (req.method === 'POST') {
    if (pathname === '/__reset') {
      // Reset contract: wipe state, answer with JSON.
      const cleared = resetState();
      sendJson(res, 200, { reset: true, cleared });
      return;
    }
    if (pathname === '/check') {
      readBody(req).then((raw) => {
        let submitted = '';
        try {
          const decoded = JSON.parse(raw.toString('utf8') || '{}');
          if (decoded && typeof decoded === 'object' && typeof decoded.flag === 'string') {
            submitted = decoded.flag;
          }
        } catch {
          submitted = '';
        }
        const expected = readFlag();
        const correct = expected !== '' && timingSafeStringEqual(expected, submitted.trim());
        sendJson(res, 200, { correct });
      });
      return;
    }
  }

  sendJson(res, 404, { error: 'not found' });
});

fs.mkdirSync(STATE_DIR, { recursive: true });
server.listen(PORT, HOST, () => {
  console.log(`echo-chamber listening on ${HOST}:${PORT}, state=${STATE_DIR}`);
});
