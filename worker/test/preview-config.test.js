import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workerConfig = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const productionConfig = JSON.parse(readFileSync(new URL('../wrangler.production.jsonc', import.meta.url), 'utf8'));

test('Worker Previews define the required environment variables explicitly', () => {
  assert.deepEqual(workerConfig.previews?.vars, {
    WATERNOW_ENVIRONMENT: 'preview',
    APP_ORIGIN: 'https://waternow.pages.dev',
    APP_ORIGINS: 'https://waternow.pages.dev',
    APP_ORIGIN_SUFFIXES: '.waternow.pages.dev'
  });
  assert.equal(workerConfig.vars.WATERNOW_ENVIRONMENT, 'development');
  assert.equal(workerConfig.previews.vars.WATERNOW_ENVIRONMENT, 'preview');
});

test('Worker Preview configuration cannot point at the production D1 database', () => {
  assert.ok(productionConfig.d1_databases?.length, 'production D1 binding must remain defined');
  assert.equal(
    JSON.stringify(workerConfig.previews || {}).includes(productionConfig.d1_databases[0].database_id),
    false,
    'Preview settings must never reuse the production D1 database ID'
  );
});
