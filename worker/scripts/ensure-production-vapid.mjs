import { createECDH } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = 'wrangler.production.jsonc';
const statusUrl = 'https://waternow-api.narayana-nagapuri25-17f.workers.dev/api/admin/status';
const VAPID_NAMES = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'];

export function generateVapidCredentials() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const publicKey = ecdh.getPublicKey(undefined, 'uncompressed');
  const privateKey = ecdh.getPrivateKey();
  if (publicKey.length !== 65 || publicKey[0] !== 4 || privateKey.length !== 32) {
    throw new Error('Node did not generate a valid uncompressed P-256 VAPID key pair.');
  }
  return {
    publicKey: publicKey.toString('base64url'),
    privateKey: privateKey.toString('base64url'),
    subject: 'https://waternow.pages.dev'
  };
}

function runWrangler(args) {
  return execFileSync('npx', ['wrangler', ...args], {
    cwd: workerRoot, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024
  });
}

async function readProductionPushStatus() {
  const response = await fetch(statusUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Could not read production push configuration (HTTP ' + response.status + '). Refusing to rotate any keys.');
  const body = await response.json().catch(() => null);
  if (!body || typeof body.pushConfigured !== 'boolean') throw new Error('Production status did not provide a valid pushConfigured flag. Refusing to rotate any keys.');
  return body.pushConfigured;
}

function existingVapidSecretNames() {
  const output = runWrangler(['secret', 'list', '--config', config]);
  let rows;
  try { rows = JSON.parse(output); }
  catch { throw new Error('Could not safely inspect existing Worker secret names. Refusing to create or rotate VAPID keys.'); }
  if (!Array.isArray(rows)) throw new Error('Worker secret listing was not in the expected format. Refusing to create or rotate VAPID keys.');
  return new Set(rows.map(item => String(item?.name || '')).filter(Boolean));
}

function putSecret(name, value) {
  // Pipe values to Wrangler; never place secret material in args, files or logs.
  execFileSync('npx', ['wrangler', 'secret', 'put', name, '--config', config], {
    cwd: workerRoot, input: value + '\n', encoding: 'utf8',
    stdio: ['pipe', 'ignore', 'pipe'], maxBuffer: 1024 * 1024
  });
}

export async function ensureProductionVapid() {
  if (await readProductionPushStatus()) {
    console.log('Production Web Push is already configured. Existing VAPID keys were left unchanged.');
    return { configured: true, created: false };
  }
  const existing = existingVapidSecretNames();
  const found = VAPID_NAMES.filter(name => existing.has(name));
  if (found.length) {
    throw new Error('Production reports Web Push as unconfigured but VAPID secret names already exist (' + found.join(', ') + '). Refusing to overwrite possibly paired keys.');
  }
  const credentials = generateVapidCredentials();
  putSecret('VAPID_PUBLIC_KEY', credentials.publicKey);
  putSecret('VAPID_PRIVATE_KEY', credentials.privateKey);
  putSecret('VAPID_SUBJECT', credentials.subject);
  console.log('Created production VAPID credentials as Worker secrets. Secret values were not logged.');
  return { configured: true, created: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  ensureProductionVapid().catch(error => {
    console.error('PRODUCTION WEB PUSH CONFIGURATION FAILED CLOSED.');
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}
