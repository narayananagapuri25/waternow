import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const BASE = 'https://waternow.pages.dev';
const workerDir = resolve(process.cwd(), 'worker');
const wrangler = resolve(workerDir, 'node_modules/.bin/wrangler');
const adminToken = String(process.env.WATERNOW_ADMIN_TOKEN || '').trim();

assert.ok(process.env.CLOUDFLARE_API_TOKEN, 'CLOUDFLARE_API_TOKEN Actions secret is missing.');
assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID, '17f1561ed0052cf9d484cb4becbf8810',
  'Refusing to inspect a different Cloudflare account.');
assert.ok(adminToken, 'WATERNOW_ADMIN_TOKEN Actions secret is missing.');

const originHeaders = { Origin: BASE, 'Content-Type': 'application/json' };

function d1(sql) {
  const output = execFileSync(wrangler, [
    'd1', 'execute', 'waternow-production', '--remote',
    '--config', 'wrangler.production.jsonc',
    '--command', sql, '--json'
  ], {
    cwd: workerDir,
    env: process.env,
    encoding: 'utf8',
    timeout: 60000,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const parsed = JSON.parse(output.trim());
  const set = Array.isArray(parsed) ? parsed.find(item => Array.isArray(item?.results)) : parsed;
  assert.ok(Array.isArray(set?.results), 'Unexpected D1 JSON response.');
  return set.results;
}

function readCookies(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  return values.map(value => String(value).split(';')[0]).filter(Boolean).join('; ');
}

async function jsonRequest(path, { method = 'GET', body, cookie = '' } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      ...originHeaders,
      ...(cookie ? { Cookie: cookie } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
    cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  assert.ok(response.ok, method + ' ' + path + ' returned HTTP ' + response.status + ': ' + JSON.stringify(data));
  return { response, data };
}

// Protect customers: send only when exactly one customer device is subscribed.
const [subscriptionSummary] = d1(`
  SELECT COUNT(*) AS total_subscriptions,
         COUNT(DISTINCT customer_id) AS subscribed_customers,
         MAX(updated_at) AS latest_subscription_at
  FROM push_subscriptions
`);
const total = Number(subscriptionSummary?.total_subscriptions || 0);
const customers = Number(subscriptionSummary?.subscribed_customers || 0);
assert.equal(total, 1, 'Expected exactly one subscribed customer device; refusing to broadcast to multiple devices.');
assert.equal(customers, 1, 'Expected exactly one subscribed customer account; refusing to broadcast.');
assert.ok(subscriptionSummary?.latest_subscription_at, 'The customer subscription has no saved timestamp.');

const login = await jsonRequest('/api/admin/login', {
  method: 'POST',
  body: { token: adminToken }
});
const ownerCookie = readCookies(login.response);
assert.ok(ownerCookie, 'Owner login did not issue an authenticated session cookie.');

const ownerStatus = await jsonRequest('/api/admin/status', { cookie: ownerCookie });
assert.equal(ownerStatus.data.ok, true, 'Owner session is not valid.');
assert.equal(ownerStatus.data.pushConfigured, true, 'Production VAPID configuration is missing.');

const tag = 'waternow-customer-push-test-' + Date.now();
const broadcast = await jsonRequest('/api/notifications/broadcast', {
  method: 'POST',
  cookie: ownerCookie,
  body: {
    channels: ['app'],
    title: 'WaterNow test notification',
    body: 'Customer order notifications are connected on this device. This is a test message.',
    url: '/#profile',
    tag
  }
});
const appResult = (broadcast.data.results || []).find(result => result.channel === 'app');
assert.ok(appResult, 'The production API did not return an app-push result.');
assert.equal(Number(appResult.recipients), 1, 'The test did not target exactly one customer device.');
assert.equal(Number(appResult.success), 1, 'The push provider did not accept the customer notification.');
assert.equal(Number(appResult.failure), 0, 'The customer push provider reported a delivery failure.');

console.log('WATERNOW_CUSTOMER_PUSH_TEST=' + JSON.stringify({
  result: 'provider_accepted',
  subscribedDevices: total,
  subscribedCustomers: customers,
  subscriptionUpdatedAt: subscriptionSummary.latest_subscription_at,
  recipients: Number(appResult.recipients),
  acceptedByPushProvider: Number(appResult.success),
  failed: Number(appResult.failure),
  channel: appResult.channel,
  message: 'WaterNow test notification',
  tag
}));
