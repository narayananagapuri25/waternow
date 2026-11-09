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

test('Worker Previews use only the dedicated migrated WaterNow Preview D1 database', () => {
  assert.ok(productionConfig.d1_databases?.length, 'production D1 binding must remain defined');
  assert.deepEqual(workerConfig.previews?.d1_databases, [{
    binding: 'DB',
    database_name: 'waternow-preview',
    database_id: '62531d65-a4f0-45aa-b89a-d7d94cff177c',
    migrations_dir: 'migrations'
  }]);
  assert.notEqual(workerConfig.previews.d1_databases[0].database_id, productionConfig.d1_databases[0].database_id,
    'Preview settings must never reuse the production D1 database ID');
  assert.notEqual(workerConfig.previews.d1_databases[0].database_id, '00000000-0000-4000-8000-000000000001',
    'Preview must never use the fake local development database ID');
});
