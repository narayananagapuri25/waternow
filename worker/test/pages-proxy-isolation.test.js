import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pagesProxy = readFileSync(new URL('../../functions/api/[[path]].js', import.meta.url), 'utf8');
const productionConfig = readFileSync(new URL('../wrangler.production.jsonc', import.meta.url), 'utf8');

test('Pages API proxy routes only through the WaterNow Worker service binding and fails closed', () => {
  assert.match(pagesProxy, /context\.env\.WATERNOW_API/);
  assert.match(pagesProxy, /binding\.fetch\(context\.request\)/);
  assert.match(pagesProxy, /status:\s*503/);
  assert.doesNotMatch(pagesProxy, /FRESHWAY|freshway|fwcoldpressed|all-in-one-all/);
  assert.doesNotMatch(pagesProxy, /fallbackOrigin|productionHosts|fetch\(buildRequest/);
});

test('production Worker config binds only the dedicated WaterNow D1 database', () => {
  const config = JSON.parse(productionConfig);
  assert.equal(config.name, 'waternow-api');
  assert.equal(config.d1_databases.length, 1);
  assert.equal(config.d1_databases[0].binding, 'DB');
  assert.equal(config.d1_databases[0].database_name, 'waternow-production');
  assert.equal(config.d1_databases[0].database_id, 'da57af93-2f4f-42f1-b2f3-eb02533bf9fd');
  assert.equal(config.vars.WATERNOW_ENVIRONMENT, 'production');
  assert.equal(config.vars.APP_ORIGIN, 'https://waternow.pages.dev');
});
