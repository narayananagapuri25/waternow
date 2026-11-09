import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = resolve(workerRoot, 'migrations');
const baselineCutoff = 52;

function parseWranglerJson(output) {
  for (let start = output.indexOf('['); start !== -1; start = output.indexOf('[', start + 1)) {
    const end = output.lastIndexOf(']');
    if (end < start) break;
    try {
      const parsed = JSON.parse(output.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Wrangler may print a banner before its JSON payload. Try the next array start.
    }
  }
  throw new Error('Wrangler did not return a readable JSON result for the production D1 migration ledger.');
}

function readAppliedMigrations() {
  const sql = 'SELECT name FROM d1_migrations ORDER BY name';
  const output = execFileSync('npx', [
    'wrangler', 'd1', 'execute', 'waternow-production',
    '--remote',
    '--config', 'wrangler.production.jsonc',
    '--command', sql,
    '--json'
  ], {
    cwd: workerRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const payload = parseWranglerJson(output);
  return new Set(payload.flatMap(result => Array.isArray(result?.results)
    ? result.results.map(row => row.name).filter(name => typeof name === 'string')
    : []));
}

const expectedBaseline = readdirSync(migrationsDir)
  .filter(name => /^\d{4}_.+\.sql$/.test(name) && Number(name.slice(0, 4)) <= baselineCutoff)
  .sort();

if (!expectedBaseline.includes('0051_waternow_supplier_network.sql') ||
    !expectedBaseline.includes('0052_waternow_catalogue_seed.sql')) {
  throw new Error('The repository is missing the expected WaterNow baseline migrations 0051 and 0052.');
}

let applied;
try {
  applied = readAppliedMigrations();
} catch (error) {
  console.error('PRODUCTION D1 MIGRATION BASELINE CHECK FAILED.');
  console.error('Could not read the existing d1_migrations ledger. No production migrations have been applied.');
  console.error('This guard prevents historical cleanup migrations from being replayed against existing WaterNow data.');
  console.error(error?.stderr?.toString?.() || error?.message || error);
  process.exit(1);
}

const missing = expectedBaseline.filter(name => !applied.has(name));
if (missing.length) {
  console.error('PRODUCTION D1 MIGRATION BASELINE CHECK FAILED.');
  console.error('The live database does not record every migration through 0052 as already applied.');
  console.error('No migration or Worker deployment will run. Reconcile the existing D1 schema and migration history first.');
  console.error('Missing baseline entries:');
  for (const name of missing) console.error(' - ' + name);
  process.exit(1);
}

console.log('Production D1 migration baseline verified: ' + expectedBaseline.length +
  ' existing migrations through 0052 are already recorded. Only newly added migrations can run.');
