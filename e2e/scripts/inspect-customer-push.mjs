import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const workerDir = resolve(process.cwd(), 'worker');
const wrangler = resolve(workerDir, 'node_modules/.bin/wrangler');

assert.ok(process.env.CLOUDFLARE_API_TOKEN, 'CLOUDFLARE_API_TOKEN Actions secret is missing.');
assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID, '17f1561ed0052cf9d484cb4becbf8810',
  'Refusing to inspect a different Cloudflare account.');

function query(sql) {
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
  const resultSet = Array.isArray(parsed) ? parsed.find(item => Array.isArray(item?.results)) : parsed;
  assert.ok(Array.isArray(resultSet?.results), 'Unexpected D1 JSON response.');
  return resultSet.results;
}

const [summary] = query(`
  SELECT COUNT(*) AS total_subscriptions,
         COUNT(DISTINCT customer_id) AS subscribed_customers,
         MAX(updated_at) AS latest_subscription_at
  FROM push_subscriptions
`);
const recentEvents = query(`
  SELECT event_type,status,recipient_count,success_count,failure_count,last_error,created_at
  FROM notification_events
  WHERE audience='customer'
  ORDER BY id DESC
  LIMIT 10
`);

console.log('CUSTOMER_PUSH_SUBSCRIPTION_DIAGNOSTICS=' + JSON.stringify({
  inspected: true,
  totalSubscriptions: Number(summary?.total_subscriptions || 0),
  subscribedCustomers: Number(summary?.subscribed_customers || 0),
  latestSubscriptionAt: summary?.latest_subscription_at || null,
  recentCustomerDeliveryEvents: recentEvents.map(event => ({
    eventType: event.event_type,
    status: event.status,
    recipients: Number(event.recipient_count || 0),
    sent: Number(event.success_count || 0),
    failed: Number(event.failure_count || 0),
    lastError: event.last_error || null,
    createdAt: event.created_at || null
  }))
}));
assert.ok(Number(summary?.total_subscriptions || 0) > 0,
  'No customer push subscription is stored in production D1 yet.');
