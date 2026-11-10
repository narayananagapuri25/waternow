import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { onRequest as apiOnRequest } from './api/[[path]].js';

const apiProxyPath = fileURLToPath(new URL('./api/[[path]].js', import.meta.url));
const apiProxy = readFileSync(apiProxyPath, 'utf8');
const workerAuthPath = fileURLToPath(new URL('../worker/src/passcode-auth.js', import.meta.url));
const workerAuth = readFileSync(workerAuthPath, 'utf8');
const addressApiPath = fileURLToPath(new URL('../worker/src/address-api.js', import.meta.url));
const addressApi = readFileSync(addressApiPath, 'utf8');
const browserFixPath = fileURLToPath(new URL('../address-fix.js', import.meta.url));
const browserFix = readFileSync(browserFixPath, 'utf8');
const addressUiPath = fileURLToPath(new URL('../address-system-final.js', import.meta.url));
const addressUi = readFileSync(addressUiPath, 'utf8');

assert.match(apiProxy, /context\.env\.WATERNOW_API/);
assert.match(apiProxy, /WaterNow API service binding is not configured/);
assert.match(apiProxy, /WaterNow API is temporarily unavailable/);
assert.match(apiProxy, /no production fallback/i);
assert.doesNotMatch(apiProxy, /freshway-api|all-in-one-all\.workers\.dev/i,
  'Pages API routing must never fall back to another application or a production Worker URL');

// A preview without a configured WaterNow Worker binding fails closed.
let nextCalled = false;
const noBinding = await apiOnRequest({
  request: new Request('https://branch.waternow.pages.dev/api/health'),
  env: {},
  next: async () => { nextCalled = true; return new Response('unexpected next'); }
});
assert.equal(noBinding.status, 503);
assert.match((await noBinding.json()).error, /WaterNow API service binding is not configured/);
assert.equal(nextCalled, false, 'API requests must not silently fall through to a Pages asset');

// A configured binding receives the original API request unchanged.
let forwarded = null;
const payload = { customerId: 'qa-customer', address: { house: 'QA-1' } };
const success = await apiOnRequest({
  request: new Request('https://branch.waternow.pages.dev/api/addresses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-qa-request': 'waternow-contract' },
    body: JSON.stringify(payload)
  }),
  env: {
    WATERNOW_API: {
      fetch: async request => {
        forwarded = {
          url: request.url,
          method: request.method,
          header: request.headers.get('x-qa-request'),
          body: await request.json()
        };
        return Response.json({ ok: true, addresses: [], source: 'isolated-preview-worker' }, { status: 201 });
      }
    }
  },
  next: async () => new Response('unexpected next')
});
assert.equal(success.status, 201);
assert.deepEqual(await success.json(), { ok: true, addresses: [], source: 'isolated-preview-worker' });
assert.deepEqual(forwarded, {
  url: 'https://branch.waternow.pages.dev/api/addresses',
  method: 'POST',
  header: 'waternow-contract',
  body: payload
});

// A binding failure returns a safe 503 and does not select a different upstream.
const unavailable = await apiOnRequest({
  request: new Request('https://branch.waternow.pages.dev/api/orders', { method: 'GET' }),
  env: { WATERNOW_API: { fetch: async () => { throw new Error('private upstream detail'); } } },
  next: async () => new Response('unexpected next')
});
assert.equal(unavailable.status, 503);
assert.deepEqual(await unavailable.json(), { error: 'WaterNow API is temporarily unavailable.' });

assert.match(workerAuth, /addressMatch/);
assert.match(workerAuth, /Method not allowed/);
assert.match(workerAuth, /new Request\(new URL/);
assert.match(addressApi, /const id = action === 'create' \? 0 : Number\(/);
assert.match(addressApi, /if \(action !== 'create' && \(!Number\.isInteger\(id\) \|\| id < 1\)\)/);
assert.match(addressApi, /Could not save the order delivery-address snapshot/);
assert.match(browserFix, /default\|delete/);
assert.match(addressUi, /async function readJsonResponse\(response\)/);
assert.match(addressUi, /Address service returned invalid data/);
assert.match(addressUi, /Choose the exact match\. Nothing is selected until you tap a result\./);
assert.match(addressUi, /locationLookupPending/);
console.log('WaterNow Pages service-binding isolation and customer address contracts OK');
