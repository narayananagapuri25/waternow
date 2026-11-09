import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import worker from '../../worker/src/admin-auth.js';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const HOST = '127.0.0.1';
const PORT = Number(process.env.WATERNOW_E2E_PORT || 4179);
const ORIGIN = 'http://' + HOST + ':' + PORT;

class SQLiteD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
    this.sqlite.exec(readFileSync(resolve(ROOT, 'worker/schema.sql'), 'utf8'));
    this.sqlite.exec(readFileSync(resolve(ROOT, 'worker/migrations/0052_waternow_catalogue_seed.sql'), 'utf8'));
  }

  prepare(sql) {
    const owner = this;
    let values = [];
    const statement = {
      bind(...args) { values = args; return statement; },
      async first(columnName) {
        const row = owner.sqlite.prepare(sql).get(...values) ?? null;
        return columnName && row ? row[columnName] : row;
      },
      async all() {
        return { results: owner.sqlite.prepare(sql).all(...values) };
      },
      async run() {
        const result = owner.sqlite.prepare(sql).run(...values);
        return {
          success: true,
          meta: {
            changes: Number(result.changes || 0),
            last_row_id: Number(result.lastInsertRowid || 0)
          }
        };
      }
    };
    return statement;
  }

  async batch(statements) {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  close() { this.sqlite.close(); }
}

const DB = new SQLiteD1();
const env = {
  DB,
  APP_ORIGIN: ORIGIN,
  APP_ORIGINS: ORIGIN + ',http://localhost:' + PORT,
  WATERNOW_ENVIRONMENT: 'development',
  ADMIN_TOKEN: process.env.WATERNOW_E2E_ADMIN_TOKEN || '1234',
  ADMIN_SESSION_SECRET: 'waternow-e2e-only-admin-session-secret-not-for-deployment',
  CUSTOMER_SESSION_SECRET: 'waternow-e2e-only-customer-session-secret-not-for-deployment',
  VAPID_PUBLIC_KEY: '',
  VAPID_PRIVATE_KEY: '',
  VAPID_SUBJECT: ''
};

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf'
};

function staticPath(pathname) {
  let relative = decodeURIComponent(pathname);
  if (relative === '/' || relative === '/index.html') return resolve(ROOT, 'index.html');
  if (relative === '/admin' || relative === '/admin/') return resolve(ROOT, 'admin.html');
  if (relative === '/admin/index.html') return resolve(ROOT, 'admin.html');
  if (relative.startsWith('/admin/')) {
    relative = relative.slice('/admin/'.length);
    if (relative === 'sw.js') relative = 'admin/sw.js';
    else if (relative === 'manifest.webmanifest') relative = 'admin/manifest.webmanifest';
  } else {
    relative = relative.replace(/^\/+/, '');
  }
  const target = resolve(ROOT, relative);
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;
  return target;
}

const server = createServer(async (incoming, outgoing) => {
  const url = new URL(incoming.url || '/', ORIGIN);
  if (url.pathname === '/health') {
    outgoing.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    outgoing.end('ok');
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    const headers = new Headers();
    for (const name of ['content-type', 'cookie', 'origin', 'accept', 'authorization', 'x-waternow-environment']) {
      const value = incoming.headers[name];
      if (value) headers.set(name, value);
    }
    const chunks = [];
    if (!['GET', 'HEAD'].includes(incoming.method || 'GET')) {
      for await (const chunk of incoming) chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    const request = new Request(ORIGIN + url.pathname + url.search, {
      method: incoming.method || 'GET',
      headers,
      ...(body.length ? { body } : {})
    });
    const pending = [];
    const context = { waitUntil(promise) { pending.push(Promise.resolve(promise).catch(error => { process.stderr.write('waitUntil: ' + String(error?.message || error) + '\n'); })); } };
    try {
      const response = await worker.fetch(request, env, context);
      const responseHeaders = {};
      for (const [key, value] of response.headers.entries()) responseHeaders[key] = value;
      if (typeof response.headers.getSetCookie === 'function') {
        const cookies = response.headers.getSetCookie();
        if (cookies.length) responseHeaders['set-cookie'] = cookies;
      }
      outgoing.writeHead(response.status, responseHeaders);
      outgoing.end(incoming.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
      void Promise.allSettled(pending);
    } catch (error) {
      process.stderr.write('Worker request failed: ' + String(error?.stack || error) + '\n');
      outgoing.writeHead(500, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      outgoing.end(JSON.stringify({ error: 'Isolated Worker test server failed.' }));
    }
    return;
  }

  if (!['GET', 'HEAD'].includes(incoming.method || 'GET')) {
    outgoing.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'GET, HEAD' });
    outgoing.end('Method not allowed');
    return;
  }
  try {
    const target = staticPath(url.pathname);
    if (!target || !existsSync(target) || !statSync(target).isFile()) {
      outgoing.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      outgoing.end('Not found');
      return;
    }
    const content = readFileSync(target);
    outgoing.writeHead(200, {
      'content-type': mime[extname(target).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    });
    outgoing.end(incoming.method === 'HEAD' ? undefined : content);
  } catch (error) {
    process.stderr.write('Static request failed: ' + String(error?.message || error) + '\n');
    outgoing.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    outgoing.end('Static test server failed');
  }
});

server.listen(PORT, HOST);
const shutdown = () => server.close(() => {
  try { DB.close(); } catch (_) {}
  process.exit(0);
});
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
