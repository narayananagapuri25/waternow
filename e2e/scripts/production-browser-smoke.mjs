import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const BASE = (process.env.WATERNOW_APP_ORIGIN || 'https://waternow.pages.dev').replace(/\/$/, '');
const checks = [];

function pass(name, detail = {}) {
  checks.push({ name, passed: true, ...detail });
  console.log('PASS ' + name + (Object.keys(detail).length ? ' ' + JSON.stringify(detail) : ''));
}

async function openPage(browser, name, path, viewport, verify) {
  const context = await browser.newContext({
    viewport,
    serviceWorkers: 'block',
    ignoreHTTPSErrors: false
  });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  const pageErrors = [];
  const sameOriginFailures = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (!response.url().startsWith(BASE) || response.status() < 400) return;
    const pathname = new URL(response.url()).pathname;
    // Unauthenticated customer/Owner API requests may correctly return 401;
    // treat only API server errors and failed same-origin page assets as failures.
    if ((pathname.startsWith('/api/') && response.status() >= 500) ||
        (!pathname.startsWith('/api/') && response.status() >= 400)) {
      sameOriginFailures.push({ status: response.status(), url: response.url() });
    }
  });
  const response = await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 35000 });
  assert.equal(response?.status(), 200, name + ' did not return HTTP 200');
  await verify(page);
  const geometry = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    title: document.title
  }));
  assert.ok(geometry.documentWidth <= geometry.viewportWidth + 2,
    name + ' has horizontal overflow: ' + JSON.stringify(geometry));
  assert.deepEqual(pageErrors, [], name + ' raised JavaScript page errors.');
  assert.deepEqual(sameOriginFailures, [], name + ' returned failed same-origin assets/APIs: ' + JSON.stringify(sameOriginFailures));
  pass(name, { ...geometry, pageErrors: pageErrors.length, failedSameOriginRequests: sameOriginFailures.length });
  await context.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const verifyCustomer = async page => {
      assert.match(await page.title(), /WaterNow/i);
      await page.waitForFunction(
        () => document.querySelectorAll('#productGrid .product-card').length === 2,
        { timeout: 25000 }
      );
      const products = page.locator('#productGrid .product-card');
      const twenty = products.filter({ hasText: '20L Drinking Water Can' });
      const ten = products.filter({ hasText: '10L Drinking Water Can' });
      assert.equal(await twenty.count(), 1, 'The customer page must show exactly one 20L product card.');
      assert.equal(await ten.count(), 1, 'The customer page must show exactly one 10L product card.');
      await twenty.locator('.product-price').getByText('₹30', { exact: false }).waitFor();
      await ten.locator('.product-price').getByText('₹20', { exact: false }).waitFor();
      assert.equal(await page.locator('#viewCartBtn').count(), 1, 'Customer cart control is missing.');
      assert.equal(await page.locator('#checkoutDeliveryPicker').count(), 1, 'Date-only delivery control container is missing.');
      assert.equal(await page.locator('#productGrid .product-card').count(), 2);
      assert.equal(await page.locator('#productGrid .product-card').filter({ hasText: '₹0' }).count(), 0,
        'A zero-price product must not be displayed.');
      const body = await page.locator('#homeView').innerText();
      assert.match(body, /Available water products/i);
    };

    await openPage(browser, 'Customer app mobile browser UI', '/', { width: 390, height: 844 }, verifyCustomer);
    await openPage(browser, 'Customer app desktop browser UI', '/', { width: 1365, height: 900 }, verifyCustomer);

    const verifyOwner = async page => {
      assert.match(await page.title(), /WaterNow.*Owner/i);
      await page.locator('#loginView').waitFor({ state: 'visible' });
      await page.locator('#adminToken').waitFor({ state: 'visible' });
      await page.locator('#connectBtn').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#appView').isVisible(), false,
        'Owner management screens must remain hidden before authentication.');
      assert.equal(await page.locator('#adminToken').getAttribute('type'), 'password',
        'Owner credential input must be masked.');
      assert.match(await page.locator('#loginView').innerText(), /Securely sign in/i);
    };

    await openPage(browser, 'Owner app mobile login UI', '/admin/', { width: 390, height: 844 }, verifyOwner);
    await openPage(browser, 'Owner app desktop login UI', '/admin/', { width: 1365, height: 900 }, verifyOwner);
    console.log(JSON.stringify({ passed: checks.length, failed: 0, checks }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error('WATERNOW PRODUCTION BROWSER SMOKE FAILED: ' + (error?.stack || error));
  process.exitCode = 1;
});
