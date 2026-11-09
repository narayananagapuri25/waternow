import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../.github/workflows/waternow-ci.yml', import.meta.url), 'utf8');
const baselineGuard = readFileSync(new URL('../scripts/require-production-d1-baseline.mjs', import.meta.url), 'utf8');
const productionConfig = JSON.parse(readFileSync(new URL('../wrangler.production.jsonc', import.meta.url), 'utf8'));

test('production deployment is gated behind every CI test job and restricted to main', () => {
  assert.match(workflow, /production-deploy:[\s\S]*?needs:[\s\S]*?worker-tests[\s\S]*?owner-ui-regression[\s\S]*?browser-tests/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test('production D1 migrations are guarded before Wrangler applies pending migrations', () => {
  const guardIndex = workflow.indexOf('node ./scripts/require-production-d1-baseline.mjs');
  const applyIndex = workflow.indexOf('wrangler d1 migrations apply waternow-production');
  const deployIndex = workflow.indexOf('wrangler deploy --config wrangler.production.jsonc');
  assert.ok(guardIndex >= 0 && applyIndex > guardIndex && deployIndex > applyIndex);
  assert.match(baselineGuard, /d1_migrations/);
  assert.match(baselineGuard, /baselineCutoff = 52/);
  assert.match(baselineGuard, /0051_waternow_supplier_network\.sql/);
  assert.match(baselineGuard, /0052_waternow_catalogue_seed\.sql/);
});

test('production Worker is pinned to the isolated WaterNow account and D1 database', () => {
  assert.equal(productionConfig.name, 'waternow-api');
  assert.equal(productionConfig.account_id, '17f1561ed0052cf9d484cb4becbf8810');
  assert.equal(productionConfig.migrations_dir, './migrations');
  assert.deepEqual(productionConfig.d1_databases.map(database => ({
    binding: database.binding,
    database_name: database.database_name,
    database_id: database.database_id
  })), [{
    binding: 'DB',
    database_name: 'waternow-production',
    database_id: 'da57af93-2f4f-42f1-b2f3-eb02533bf9fd'
  }]);
  assert.equal(productionConfig.vars.WATERNOW_ENVIRONMENT, 'production');
});
