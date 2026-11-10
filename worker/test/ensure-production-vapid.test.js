import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVapidCredentials } from '../scripts/ensure-production-vapid.mjs';
import { webpush } from '../src/order-alerts.js';

test('generated production VAPID credentials are accepted by web-push', () => {
  const credentials = generateVapidCredentials();
  const publicBytes = Buffer.from(credentials.publicKey, 'base64url');
  const privateBytes = Buffer.from(credentials.privateKey, 'base64url');
  assert.equal(publicBytes.length, 65);
  assert.equal(publicBytes[0], 4);
  assert.equal(privateBytes.length, 32);
  assert.equal(credentials.subject, 'https://waternow.pages.dev');
  assert.doesNotThrow(() => webpush.setVapidDetails(credentials.subject, credentials.publicKey, credentials.privateKey));
});
