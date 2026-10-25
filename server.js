// Сервер «Мегалюля»: отдаёт файлы из public/ и выполняет API из functions/
// (тот же код, что развёртывается на Cloudflare Pages). Нужен Node 22.13 или новее:
// база хранится во встроенном SQLite, сторонних пакетов нет.
//
//   npm start            — http://localhost:3000
//   переменные окружения — см. .env.example

import http from 'node:http';
import { createReadStream, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import * as scores from './functions/api/scores.js';
import * as feedback from './functions/api/feedback.js';
import * as adminFeedback from './functions/api/admin/feedback.js';
import * as adminScores from './functions/api/admin/scores.js';
import * as adminScore from './functions/api/admin/scores/[id].js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DB_PATH = process.env.DB_PATH || join(ROOT, 'data', 'megalul.db');

// ---------- база: файл SQLite с интерфейсом как у Cloudflare D1 (prepare / bind / all / first / run) ----------
mkdirSync(dirname(DB_PATH), { recursive: true });
const sqlite = new DatabaseSync(DB_PATH);
sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
sqlite.exec(readFileSync(join(ROOT, 'schema.sql'), 'utf8'));

function d1(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      const bound = (params) => ({
        bind: (...p) => bound(p),
        all: async () => ({ success: true, results: stmt.all(...params) }),
        first: async (column) => {
          const row = stmt.get(...params);
          if (row === undefined) return null;
          return column === undefined ? row : row[column];
        },
        run: async () => {
          const r = stmt.run(...params);
          return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
        },
      });
      return bound([]);
    },
  };
}

const env = {
  DB: d1(sqlite),
  ADMIN_KEY: process.env.ADMIN_KEY || '',
  TG_TOKEN: process.env.TG_TOKEN || '',
  TG_CHAT: process.env.TG_CHAT || '',
};

// ---------- API: те же маршруты, что файлы в functions/api ----------
const routes = [
  { match: (p) => p === '/api/scores' && {}, mod: scores },
  { match: (p) => p === '/api/feedback' && {}, mod: feedback },
  { match: (p) => p === '/api/admin/feedback' && {}, mod: adminFeedback },
  { match: (p) => p === '/api/admin/scores' && {}, mod: adminScores },
  {
    match: (p) => {
      const m = /^\/api\/admin\/scores\/([^/]+)$/.exec(p);
      return m && { id: m[1] };
    },
    mod: adminScore,
  },
];

const SKIP_HEADERS = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive', 'upgrade']);

async function readBody(req, max) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw Object.assign(new Error('too_large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handleApi(req, res, url) {
  for (const route of routes) {
    const params = route.match(url.pathname);
    if (!params) continue;
    const method = req.method.toUpperCase();
    const handler = route.mod['onRequest' + method[0] + method.slice(1).toLowerCase()] || route.mod.onRequest;
    if (!handler) return send(res, 405, { ok: false, error: 'method_not_allowed' });
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v != null && !SKIP_HEADERS.has(k)) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req, 64 * 1024);
    const request = new Request(url, { method, headers, body });
    const context = { request, env, params, waitUntil: (p) => Promise.resolve(p).catch((e) => console.warn(e)) };
    const response = await handler(context);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  send(res, 404, { ok: false, error: 'not_found' });
}

// ---------- статика из public/ ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
const LONG_CACHE = new Set(['.mp3', '.ogg', '.wav', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.woff', '.woff2']);

function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, 'Bad request');
  }
  if (pathname === '/megalul-3d.html') {              // старый адрес 3D-игры: теперь она открывается с главной
    res.writeHead(301, { location: '/' + url.search });
    return res.end();
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(PUBLIC, '.' + pathname);
  if (file !== PUBLIC && !file.startsWith(PUBLIC + sep)) return send(res, 404, 'Not found');
  let st;
  try {
    st = statSync(file);
  } catch {
    return send(res, 404, 'Not found');
  }
  if (st.isDirectory()) {
    res.writeHead(301, { location: url.pathname + '/' });
    return res.end();
  }
  const ext = extname(file).toLowerCase();
  const headers = {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': LONG_CACHE.has(ext) ? 'public, max-age=86400' : 'no-cache',
    'accept-ranges': 'bytes',
    'x-content-type-options': 'nosniff',
  };
  // Частичная отдача нужна Safari для звука.
  const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
    if (start >= st.size || start > end) {
      res.writeHead(416, { 'content-range': 'bytes */' + st.size });
      return res.end();
    }
    res.writeHead(206, { ...headers, 'content-length': end - start + 1, 'content-range': 'bytes ' + start + '-' + end + '/' + st.size });
    if (req.method === 'HEAD') return res.end();
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'content-length': st.size });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

function send(res, status, data) {
  const isJson = typeof data === 'object';
  res.writeHead(status, { 'content-type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  res.end(isJson ? JSON.stringify(data) : data);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, url);
    else send(res, 405, 'Method not allowed');
  } catch (e) {
    console.error(new Date().toISOString(), req.method, url.pathname, e);
    if (!res.headersSent) send(res, e.status || 500, { ok: false, error: e.status ? e.message : 'server_error' });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log('Мегалюль: http://localhost:' + PORT + (HOST !== '0.0.0.0' && HOST !== '127.0.0.1' ? '  (host ' + HOST + ')' : ''));
  console.log('  база:       ' + DB_PATH);
  console.log('  админка:    ' + (env.ADMIN_KEY ? 'ключ задан, /admin.html открыта' : 'ADMIN_KEY не задан, /admin.html закрыта'));
  console.log('  Telegram:   ' + (env.TG_TOKEN && env.TG_CHAT ? 'пересылка отзывов включена' : 'выключен'));
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close();
    sqlite.close();
    process.exit(0);
  });
}
