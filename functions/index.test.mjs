import assert from 'node:assert/strict';
import { onRequest } from './index.js';

const html = `<!doctype html><html lang="en"><head>
<meta property="og:title" content="WaterNow">
<meta name="twitter:title" content="WaterNow">
<meta property="og:description" content="Drinking water delivered locally">
<meta name="twitter:description" content="Drinking water delivered locally">
</head><body>WaterNow</body></html>`;

function makeContext(method = 'GET', environment = 'production') {
  const calls = [];
  return {
    calls,
    context: {
      request: new Request('https://waternow.pages.dev/', { method }),
      env: {
        WATERNOW_ENVIRONMENT: environment,
        ASSETS: {
          fetch: async request => {
            assert.equal(new URL(request.url).pathname, '/');
            return new Response(html, {
              status: 200,
              headers: {
                'content-type': 'text/html; charset=UTF-8',
                'cache-control': 'no-store, max-age=0, must-revalidate',
                etag: '"waternow-asset-etag"'
              }
            });
          }
        },
        WATERNOW_API: {
          fetch: async request => {
            calls.push({ pathname: new URL(request.url).pathname, environment: request.headers.get('X-WaterNow-Environment') });
            assert.equal(new URL(request.url).pathname, '/api/store-profile');
            assert.equal(request.headers.get('X-WaterNow-Environment'), environment);
            return Response.json({
              storeProfile: {
                shareTitle: 'WaterNow local delivery',
                shareDescription: 'Order water cans from local suppliers with convenient home delivery.'
              }
            });
          }
        }
      },
      next: async () => new Response('next')
    }
  };
}

for (const method of ['GET', 'HEAD']) {
  const { context, calls } = makeContext(method, 'production');
  const response = await onRequest(context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0, must-revalidate');
  assert.equal(response.headers.get('etag'), null, 'rewritten metadata must not reuse the static asset ETag');
  assert.match(response.headers.get('content-type') || '', /text\/html/i);
  assert.equal(calls.length, 1, 'share metadata is loaded from the WaterNow Worker binding');
  if (method === 'GET') {
    const body = await response.text();
    assert.match(body, /WaterNow local delivery/);
    assert.match(body, /Order water cans from local suppliers/);
    assert.doesNotMatch(body, /FreshWay/i);
  } else {
    assert.equal(await response.text(), '');
  }
}

const preview = await onRequest(makeContext('GET', 'preview').context);
assert.equal(preview.status, 200);
const previewBody = await preview.text();
assert.match(previewBody, /content="WaterNow"/);
assert.doesNotMatch(previewBody, /WaterNow local delivery/);
console.log('WaterNow share metadata binding, cache policy and preview isolation contracts OK');
