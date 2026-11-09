import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import adminAuth from '../src/admin-auth.js';

const SECRET = 'test-only-admin-session-secret';
const encoder = new TextEncoder();
const toHex = bytes => [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');

async function sessionCookie() {
  const issued = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey('raw', encoder.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(issued));
  return `__Host-waternow-admin-session=${issued}.${toHex(signature)}`;
}

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async first() { return sqlite.prepare(sql).get(...args) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async run() {
          const result = sqlite.prepare(sql).run(...args);
          return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid || 0) } };
        }
      };
      return statement;
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(statement => {
          const result = statement.executeSync ? statement.executeSync() : null;
          return result;
        });
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
  return { sqlite, env: { DB, ADMIN_SESSION_SECRET: SECRET, APP_ORIGIN: 'https://waternow.test', APP_ORIGINS: 'https://waternow.test' } };
}

async function call(env, path, { cookie, method = 'GET', body } = {}) {
  const headers = new Headers({ Accept: 'application/json' });
  if (cookie) headers.set('Cookie', cookie);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  return adminAuth.fetch(new Request('https://waternow.test' + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  }), env, {});
}

test('Owner delivery-store APIs are protected by the authenticated Owner session', async () => {
  const { sqlite, env } = setup();
  try {
    const response = await call(env, '/api/admin/delivery/stores');
    assert.equal(response.status, 401);
    assert.match((await response.json()).error, /Unauthorized/i);
  } finally { sqlite.close(); }
});

test('authenticated Owner delivery-store list reaches the delivery-scheduling handler', async () => {
  const { sqlite, env } = setup();
  try {
    const response = await call(env, '/api/admin/delivery/stores', { cookie: await sessionCookie() });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.stores, []);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://waternow.test');
  } finally { sqlite.close(); }
});
