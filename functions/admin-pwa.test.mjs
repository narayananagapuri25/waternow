import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequest } from './admin/[[path]].js';

const readRepoFile = path => readFileSync(new URL('../' + path.replace(/^\//, ''), import.meta.url));
const ownerSource = readRepoFile('admin.html').toString('utf8');
const ownerWorkerSource = readRepoFile('admin/sw.js').toString('utf8');
const manifestSource = readRepoFile('admin/manifest.webmanifest').toString('utf8');

const ownerAssets = [
  'admin.css',
  'admin.js',
  'owner-pwa-install.js',
  'owner-pwa-install.css',
  'waternow-logo.svg',
  'waternow-icon.svg',
  'frontend/phone-display.js',
  'frontend/admin/store-profile.js',
  'frontend/admin/delivery-management.js',
  'frontend/admin/store-management.js',
  'frontend/admin/store-map-picker.js',
  'frontend/admin/customer-messages.js',
  'frontend/admin/invoice-settings.js',
  'frontend/admin/delivery-offers.js',
  'frontend/admin/account-deletions.js',
  'frontend/catalogue-media.js',
  'frontend/admin/catalogue.js',
  'frontend/admin/owner-lifecycle-autosave.js',
  'frontend/admin/push.js',
  'frontend/admin/order-alerts.js',
  'owner-lifecycle.js',
  'owner-address-final.js',
  'frontend/media/catalogue/water-20l.svg',
  'frontend/media/catalogue/water-10l-pair.svg'
];

function makeContext(path, method = 'GET') {
  const fetched = [];
  const context = {
    request: new Request('https://waternow.pages.dev' + path, { method }),
    env: {
      ASSETS: {
        fetch: async request => {
          const url = new URL(request.url);
          fetched.push({ pathname: url.pathname, search: url.search, method: request.method });
          if (url.pathname === '/admin.html') {
            return new Response(ownerSource, { headers: { 'content-type': 'text/html; charset=UTF-8' } });
          }
          if (url.pathname === '/admin/sw.js') {
            return new Response(ownerWorkerSource, { headers: { 'content-type': 'application/javascript; charset=utf-8' } });
          }
          if (url.pathname === '/admin/manifest.webmanifest') {
            return new Response(manifestSource, { headers: { 'content-type': 'application/manifest+json; charset=utf-8' } });
          }
          const file = ownerAssets.find(asset => '/' + asset === url.pathname);
          if (!file) return new Response('missing asset: ' + url.pathname, { status: 404 });
          const content = readRepoFile(file);
          const contentType = /\.css$/i.test(file) ? 'text/css; charset=utf-8'
            : /\.js$/i.test(file) ? 'application/javascript; charset=utf-8'
              : /\.svg$/i.test(file) ? 'image/svg+xml'
                : 'application/octet-stream';
          return new Response(content, { headers: { 'content-type': contentType } });
        }
      }
    },
    next: async () => new Response('next')
  };
  return { context, fetched };
}

const customerSource = readRepoFile('index.html').toString('utf8');
assert.doesNotMatch(customerSource, /href=["']\/admin(?:\.html|\/?)["']/i,
  'customer app must not expose an Owner dashboard link');

const { context: shellContext, fetched: shellFetches } = makeContext('/admin/');
const shellResponse = await onRequest(shellContext);
const shellHtml = await shellResponse.text();
assert.equal(shellResponse.status, 200);
assert.equal(shellResponse.headers.get('cache-control'), 'no-store, max-age=0, must-revalidate');
assert.equal(shellResponse.headers.get('x-robots-tag'), 'noindex, nofollow');
assert.match(shellResponse.headers.get('content-type') || '', /text\/html/i);
assert.match(shellHtml, /WaterNow Owner/);
assert.match(shellHtml, /href="\/admin\/manifest\.webmanifest"/);
assert.match(shellHtml, /src="\/admin\/waternow-logo\.svg"/);
assert.match(shellHtml, /src="\/admin\/admin\.js\?v=waternow-v1"/);
assert.match(shellHtml, /id="liveOrdersTab"/);
assert.match(shellHtml, /id="testOrdersTab"/);
assert.equal(shellFetches.length, 1);
assert.equal(shellFetches[0].pathname, '/admin.html');

const relativeAssets = [...ownerSource.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)]
  .map(([, value]) => value)
  .filter(value => !value.startsWith('/') && !value.startsWith('#') && !/^[a-z][a-z0-9+.-]*:/i.test(value));
for (const asset of relativeAssets) {
  const pathname = asset.split('?')[0];
  assert.ok(ownerAssets.includes(pathname), 'Owner route must allow its referenced relative asset: ' + pathname);
}

for (const asset of ownerAssets) {
  const isCode = /\.(?:js|css)$/i.test(asset);
  const url = '/admin/' + asset + (isCode ? '?v=qa-asset' : '');
  const { context, fetched } = makeContext(url);
  const response = await onRequest(context);
  assert.equal(response.status, 200, 'Owner asset should be served: ' + url);
  const cacheControl = response.headers.get('cache-control') || '';
  if (isCode) {
    assert.match(cacheControl, /public/i);
    assert.match(cacheControl, /max-age=31536000/i);
    assert.match(cacheControl, /immutable/i);
  }
  assert.equal(fetched[0].pathname, '/' + asset);
  assert.equal(fetched[0].search, isCode ? '?v=qa-asset' : '');
}

const { context: workerContext, fetched: workerFetches } = makeContext('/admin/sw.js?v=qa');
const workerResponse = await onRequest(workerContext);
assert.equal(workerResponse.status, 200);
assert.equal(workerResponse.headers.get('service-worker-allowed'), '/admin/');
assert.match(workerResponse.headers.get('cache-control') || '', /no-store/i);
assert.equal(await workerResponse.text(), ownerWorkerSource);
assert.equal(workerFetches[0].pathname, '/admin/sw.js');

const { context: manifestContext } = makeContext('/admin/manifest.webmanifest');
const manifestResponse = await onRequest(manifestContext);
assert.equal(manifestResponse.status, 200);
assert.match(manifestResponse.headers.get('content-type') || '', /application\/manifest\+json/i);
const manifest = await manifestResponse.json();
assert.equal(manifest.id, '/admin/waternow-owner');
assert.equal(manifest.name, 'WaterNow Owner');
assert.equal(manifest.start_url, '/admin/');
assert.equal(manifest.scope, '/admin/');
assert.equal(manifest.display, 'standalone');
assert.ok(manifest.icons.some(icon => icon.src === '/waternow-icon.svg'));
assert.match(ownerWorkerSource, /const CACHE = 'waternow-owner-v4'/);
assert.match(ownerWorkerSource, /key\.startsWith\('waternow-owner-'\)/);
assert.match(ownerWorkerSource, /url\.pathname\.startsWith\('\/admin\/'\)/);
assert.doesNotMatch(ownerWorkerSource, /FreshWay/i);
assert.ok(ownerWorkerSource.includes('/admin/admin.js?v=waternow-v1'));
assert.ok(ownerWorkerSource.includes('/admin/frontend/admin/order-alerts.js?v=20261105-history-empty-actions-v1'));

const { context: unknownContext } = makeContext('/admin/unknown');
assert.equal((await onRequest(unknownContext)).status, 404);
const { context: redirectContext } = makeContext('/admin?from=qa');
const redirect = await onRequest(redirectContext);
assert.equal(redirect.status, 308);
assert.equal(redirect.headers.get('location'), '/admin/?from=qa');
const { context: headContext } = makeContext('/admin/', 'HEAD');
assert.equal((await onRequest(headContext)).status, 200);
assert.equal(await (await onRequest(headContext)).text(), '');
const { context: postContext } = makeContext('/admin/', 'POST');
assert.equal(await (await onRequest(postContext)).text(), 'next');

console.log('WaterNow Owner PWA route, scoped asset, manifest, cache and noindex contracts OK');
