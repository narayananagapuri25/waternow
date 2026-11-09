import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = resolve(workerRoot, 'migrations');
const schemaFile = resolve(workerRoot, 'schema.sql');
const comparator = resolve(workerRoot, 'scripts', 'compare-production-schema.py');
const config = 'wrangler.production.jsonc';
const database = 'waternow-production';
const baselineCutoff = 52;

function runWrangler(args, options = {}) {
  return execFileSync('npx', ['wrangler', ...args], {
    cwd: workerRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  });
}

function parseWranglerJson(output, description) {
  const start = output.indexOf('[');
  const end = output.lastIndexOf(']');
  if (start < 0 || end < start) {
    throw new Error('Wrangler did not return readable JSON for ' + description + '.');
  }
  try {
    return JSON.parse(output.slice(start, end + 1));
  } catch {
    throw new Error('Wrangler returned invalid JSON for ' + description + '.');
  }
}

function rowsFor(output, description) {
  const payload = parseWranglerJson(output, description);
  return payload.flatMap(item => Array.isArray(item?.results) ? item.results : []);
}

function query(sql, description) {
  const output = runWrangler([
    'd1', 'execute', database, '--remote', '--config', config,
    '--command', sql, '--json'
  ]);
  return rowsFor(output, description);
}

function expectedBaseline() {
  return readdirSync(migrationsDir)
    .filter(name => /^\\d{4}_.+\\.sql$/.test(name) && Number(name.slice(0, 4)) <= baselineCutoff)
    .sort();
}

function assertZero(row, key) {
  if (Number(row[key]) !== 0) {
    throw new Error('Production baseline preflight failed: ' + key + ' must be zero; found ' + row[key] + '.');
  }
}

function verifyDataFingerprints() {
  const auditSql = `SELECT
    (SELECT COUNT(*) FROM products
      WHERE lower(trim(name)) IN ('apple','banana','grapes','guava','mango','orange','papaya','pineapple','pomegranate','watermelon')) AS retired_catalogue_products,
    (SELECT COUNT(*) FROM orders
      WHERE id IN ('FW-12031400-6NE','FW-53962202-NM5','FW-53402034-XBH','FW-31938520-0L7','FW-87828109-18W','FW-67922479-XYN','FW-08623690-412','FW-57069654-MR4','FW-35019352-MJ4','FW-78689788-FCD','FW-77588644-BHS','FW-70361915-UDE')) AS legacy_0050_test_orders,
    (SELECT COUNT(*) FROM addresses
      WHERE is_saved_address=1 AND (recipient_name IS NULL OR trim(recipient_name)='' OR delivery_phone IS NULL OR trim(delivery_phone)='')) AS incomplete_addresses_still_saved,
    (SELECT COUNT(*) FROM account_deletion_requests WHERE status='completed') AS completed_deletion_requests_not_anonymized,
    (SELECT COUNT(*) FROM delivery_stores s
      WHERE s.supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM water_suppliers w WHERE w.id=s.supplier_id)) AS supplier_refs_without_supplier,
    (SELECT COUNT(*) FROM delivery_stores s
      WHERE s.delivery_partner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM water_delivery_partners p WHERE p.id=s.delivery_partner_id)) AS partner_refs_without_partner,
    (SELECT COUNT(*) FROM orders o JOIN customers c ON c.id=o.customer_id
      WHERE c.phone IS NOT NULL AND trim(c.phone)<>'' AND o.customer_phone<>c.phone) AS orders_with_registered_phone_mismatch,
    (SELECT COUNT(*) FROM products WHERE id IN ('water-20l','water-10l-pair')) AS water_product_count,
    (SELECT COUNT(*) FROM categories WHERE id IN ('water-20l','water-10l-pair') AND active=1) AS active_water_category_count,
    (SELECT COUNT(*) FROM products WHERE id IN ('water-20l','water-10l-pair') AND active=1 AND price=0 AND stock_managed=1 AND stock_quantity=0) AS unpriced_water_product_count,
    (SELECT COUNT(*) FROM invoice_settings WHERE id=1 AND series_prefix='WN') AS waternow_invoice_prefix_count,
    (SELECT COUNT(*) FROM store_profile WHERE id=1 AND store_name='WaterNow') AS waternow_store_profile_count,
    (SELECT COUNT(*) FROM products WHERE active=1 AND id NOT IN ('water-20l','water-10l-pair')) AS non_water_active_products,
    (SELECT COUNT(*) FROM categories WHERE active=1 AND id NOT IN ('water-20l','water-10l-pair')) AS non_water_active_categories,
    (SELECT COUNT(*) FROM delivery_scheduling_settings WHERE id=1) AS delivery_scheduling_settings_count,
    (SELECT COUNT(*) FROM delivery_offer_settings WHERE id=1) AS delivery_offer_settings_count,
    (SELECT COUNT(*) FROM delivery_stores s CROSS JOIN products p
      WHERE NOT EXISTS (SELECT 1 FROM delivery_store_catalogue c WHERE c.store_id=s.id AND c.product_id=p.id)) AS missing_store_catalogue_rows,
    (SELECT COUNT(*) FROM invoice_settings i JOIN store_profile s ON s.id=1
      WHERE i.id=1 AND i.enabled=0 AND length(trim(COALESCE(i.gstin,'')))=0
        AND length(trim(COALESCE(s.store_name,'')))>0 AND length(trim(COALESCE(s.address,'')))>0) AS invoice_0028_still_eligible,
    (SELECT COUNT(*) FROM invoice_settings i
      WHERE i.id=1 AND i.enabled=0 AND i.document_type='commercial_invoice'
        AND length(trim(COALESCE(i.legal_name,'')))=0
        AND length(trim(COALESCE(i.business_address,'')))=0
        AND length(trim(COALESCE(i.state_name,'')))=0
        AND length(trim(COALESCE(i.state_code,'')))=0
        AND length(trim(COALESCE(i.gstin,'')))=0
        AND length(trim(COALESCE(i.footer,'')))=0
        AND (SELECT COUNT(*) FROM store_profile WHERE id=1 AND store_name='WaterNow'
          AND length(trim(COALESCE(address,'')))=0)=1) AS waternow_invoice_profile_unconfigured,
    (SELECT COUNT(*) FROM invoice_settings WHERE id=1 AND (
      lower(trim(COALESCE(legal_name,'')))='freshway'
      OR lower(trim(COALESCE(business_address,''))) IN ('mancherial','mancherial telangana')
    )) AS legacy_invoice_placeholders,
    (SELECT COUNT(*) FROM store_profile WHERE id=1
      AND lower(trim(COALESCE(address,''))) IN ('mancherial','mancherial telangana')) AS legacy_store_address_placeholder,
    (SELECT COUNT(*) FROM home_promotions WHERE active=1 AND (
      (id='promo-muzofq0q-rx6ie' AND alt_text='Buy 5ltr get ₹150 off')
      OR (id='promo-muzofqx8-0774i' AND alt_text='Buy 5ltr get ₹150 off')
      OR (id='promo-mvg9mrtf-5p0ae' AND COALESCE(TRIM(alt_text),'')='')
    )) AS legacy_promotion_alt_texts_remaining`;
  const rows = query(auditSql, 'historical migration data fingerprints');
  if (rows.length !== 1) throw new Error('Production baseline preflight returned an unexpected data-audit result.');
  const row = rows[0];

  for (const key of [
    'retired_catalogue_products',
    'legacy_0050_test_orders',
    'incomplete_addresses_still_saved',
    'completed_deletion_requests_not_anonymized',
    'supplier_refs_without_supplier',
    'partner_refs_without_partner',
    'orders_with_registered_phone_mismatch',
    'non_water_active_products',
    'non_water_active_categories',
    'missing_store_catalogue_rows',
    'invoice_0028_still_eligible',
    'legacy_invoice_placeholders',
    'legacy_store_address_placeholder',
    'legacy_promotion_alt_texts_remaining'
  ]) assertZero(row, key);

  for (const [key, expected] of [
    ['water_product_count', 2],
    ['active_water_category_count', 2],
    ['unpriced_water_product_count', 2],
    ['waternow_invoice_prefix_count', 1],
    ['waternow_store_profile_count', 1],
    ['waternow_invoice_profile_unconfigured', 1],
    ['delivery_scheduling_settings_count', 1],
    ['delivery_offer_settings_count', 1]
  ]) {
    if (Number(row[key]) !== expected) {
      throw new Error('Production baseline preflight failed: ' + key + ' must equal ' + expected + '; found ' + row[key] + '.');
    }
  }

  const fkViolations = query('PRAGMA foreign_key_check', 'production foreign-key check');
  if (fkViolations.length) {
    throw new Error('Production baseline preflight failed: PRAGMA foreign_key_check returned ' + fkViolations.length + ' violation(s).');
  }
}

function verifySchema() {
  const exportedSchema = join(tmpdir(), 'waternow-production-schema-' + process.pid + '.sql');
  try {
    runWrangler([
      'd1', 'export', database, '--remote', '--skip-confirmation',
      '--no-data', '--output=' + exportedSchema, '--config', config
    ]);
    execFileSync('python3', [
      comparator,
      '--expected', schemaFile,
      '--actual', exportedSchema,
      '--allow-pending-0053'
    ], { cwd: workerRoot, encoding: 'utf8', stdio: 'inherit' });
  } finally {
    try { rmSync(exportedSchema, { force: true }); } catch { /* best-effort temporary-file cleanup */ }
  }
}

function recordBaseline(migrations) {
  const values = migrations.map(name => "('" + name.replaceAll("'", "''") + "')").join(',');
  const sql = [
    'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)',
    'INSERT INTO d1_migrations (name) VALUES ' + values
  ].join(';') + ';';
  runWrangler([
    'd1', 'execute', database, '--remote', '--config', config,
    '--command', sql
  ]);
  const recorded = query('SELECT name FROM d1_migrations ORDER BY name', 'post-bootstrap migration ledger')
    .map(row => row.name)
    .sort();
  const expected = [...migrations].sort();
  if (JSON.stringify(recorded) !== JSON.stringify(expected)) {
    throw new Error('Migration ledger bootstrap verification failed. The ledger was not accepted; stop before applying migrations.');
  }
}

function main() {
  const migrations = expectedBaseline();
  if (!migrations.length ||
      !migrations.includes('0051_waternow_supplier_network.sql') ||
      !migrations.includes('0052_waternow_catalogue_seed.sql') ||
      migrations.includes('0053_delivery_store_supplier_partner_guards.sql')) {
    throw new Error('Repository baseline migration inventory is invalid.');
  }

  const ledgerState = query(
    "SELECT COUNT(*) AS present FROM sqlite_master WHERE type='table' AND name='d1_migrations'",
    'migration ledger existence'
  );
  const ledgerPresent = Number(ledgerState[0]?.present || 0) === 1;

  if (ledgerPresent) {
    const existingRows = query('SELECT name FROM d1_migrations ORDER BY name', 'existing migration ledger');
    if (existingRows.length) {
      console.log('Production D1 migration ledger already contains ' + existingRows.length +
        ' row(s). No baseline entries were changed; the strict baseline verifier will validate it.');
      return;
    }
    console.log('An empty migration ledger exists. Re-running the full schema/data preflight before recording the verified baseline.');
  }

  console.log('Running schema-only production export and canonical schema comparison.');
  verifySchema();
  console.log('Running historical migration data fingerprints and production foreign-key check.');
  verifyDataFingerprints();

  // D1 Time Travel is always on. Capture the current bookmark immediately before
  // the metadata-only ledger bootstrap so an operator has a known recovery point.
  const bookmark = runWrangler([
    'd1', 'time-travel', 'info', database, '--config', config, '--json'
  ]);
  if (!bookmark.trim()) throw new Error('Could not capture the pre-bootstrap D1 Time Travel bookmark.');

  console.log('Preflight passed. Recording ' + migrations.length +
    ' historical migration names as baseline-accounted. No historical migration SQL will run.');
  console.log('WaterNow invoice setup is intentionally disabled and blank. Historical migrations 0030-0032 contain legacy FreshWay seller defaults; they are accounted for in the baseline and will not be replayed or copied into WaterNow.');
  recordBaseline(migrations);
  console.log('Verified: production D1 baseline contains ' + migrations.length +
    ' historical migrations through 0052. New migration 0053 remains pending.');
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error('PRODUCTION D1 BASELINE BOOTSTRAP FAILED CLOSED.');
    console.error(error?.message || String(error));
    process.exit(1);
  }
}

export { expectedBaseline, verifyDataFingerprints, verifySchema, recordBaseline };
