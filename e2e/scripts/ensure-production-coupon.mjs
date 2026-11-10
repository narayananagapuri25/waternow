import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const workerDir = resolve(process.cwd(), 'worker');
const wrangler = resolve(workerDir, 'node_modules/.bin/wrangler');
const code = 'WATERNOW30';
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

function execute(sql) {
  return execFileSync(wrangler, [
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
}

assert.ok(process.env.CLOUDFLARE_API_TOKEN, 'CLOUDFLARE_API_TOKEN Actions secret is missing.');
assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID, '17f1561ed0052cf9d484cb4becbf8810',
  'Refusing to write to a different Cloudflare account.');

const sql = `INSERT INTO coupons
  (id,code,title,discount_amount,first_order_only,starts_on,ends_on,max_redemptions,per_customer_limit,active,created_at,updated_at)
  VALUES ('coupon-waternow30-qa','WATERNOW30','WaterNow ₹30 off',30,0,'${today}',NULL,10,5,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  ON CONFLICT(code) DO UPDATE SET
    title=excluded.title,
    first_order_only=0,
    starts_on=excluded.starts_on,
    ends_on=NULL,
    max_redemptions=10,
    per_customer_limit=5,
    active=1,
    updated_at=CURRENT_TIMESTAMP
  WHERE coupons.discount_amount=30`;

console.log(execute(sql));
const live = await fetch('https://waternow.pages.dev/api/coupons/available', {
  cache: 'no-store',
  signal: AbortSignal.timeout(20000)
});
assert.equal(live.status, 200, 'Live coupon endpoint did not return HTTP 200.');
const body = await live.json();
const coupon = (body.coupons || []).find(item => String(item.code).toUpperCase() === code);
assert.ok(coupon, 'WATERNOW30 is not available from the live customer coupon API. Existing code with a different discount may be present.');
assert.equal(Number(coupon.discountAmount), 30, 'Coupon does not give a fixed ₹30 discount.');
assert.equal(coupon.eligible, true, 'Coupon is not eligible for a new customer.');
console.log(JSON.stringify({
  verified: true,
  code: coupon.code,
  title: coupon.title,
  discountAmount: coupon.discountAmount,
  firstOrderOnly: coupon.firstOrderOnly,
  startsOn: coupon.startsOn,
  endsOn: coupon.endsOn,
  eligibleWithoutLogin: coupon.eligible,
  maxRedemptions: coupon.maxRedemptions
}));
