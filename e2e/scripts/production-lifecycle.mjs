import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { chromium } from '@playwright/test';

const BASE = (process.env.WATERNOW_APP_ORIGIN || 'https://waternow.pages.dev').replace(/\/$/, '');
const RUN_ID = String(process.env.GITHUB_RUN_ID || Date.now());
const ADMIN_TOKEN = String(process.env.WATERNOW_ADMIN_TOKEN || '').trim();
const STORE_ID = 'waternow-boduppal';
const STORE_ADDRESS = {
  house: 'QA Test House — Brindavan Colony',
  houseFlat: 'QA Test House — Brindavan Colony',
  area: 'Brindavan Colony',
  city: 'Boduppal',
  district: 'Medchal-Malkajgiri',
  state: 'Telangana',
  pincode: '500092',
  landmark: 'WaterNow production QA',
  note: 'Automated production acceptance test; no real delivery requested',
  latitude: 17.415,
  longitude: 78.585
};
const PRODUCTS = {
  twenty: { id: 'water-20l', qty: 5, price: 30 },
  ten: { id: 'p-mw99d1uv-vx6mg', qty: 5, price: 20 }
};
const results = [];
const createdOrderIds = [];
let adminCookie = '';
let customerCookie = '';
let customerId = '';
let customerPhone = '';
let browser;
let customerContext;
let ownerContext;
let customerPage;
let ownerPage;

function istDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const p = {};
  for (const x of parts) p[x.type] = x.value;
  const date = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + offsetDays));
  return date.toISOString().slice(0, 10);
}

function cookiePair(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  return values.map(value => String(value).split(';')[0]).filter(Boolean).join('; ');
}

async function request(path, { method = 'GET', body, cookie = '', expected = [200] } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      Origin: BASE,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { Cookie: cookie } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(25000)
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  if (!expected.includes(response.status)) {
    throw new Error(method + ' ' + path + ' returned HTTP ' + response.status + ': ' + JSON.stringify(data).slice(0, 1200));
  }
  return { status: response.status, data, cookie: cookiePair(response) };
}

function record(name, detail = {}) {
  results.push({ name, passed: true, ...detail });
  console.log('PASS ' + name + (Object.keys(detail).length ? ' ' + JSON.stringify(detail) : ''));
}

function requireData(condition, message) {
  assert.ok(condition, message);
}

function browserCookie(cookie) {
  const pair = String(cookie || '').split(';')[0];
  const index = pair.indexOf('=');
  if (index < 1) throw new Error('The authenticated browser cookie could not be parsed.');
  return {
    name: pair.slice(0, index),
    value: pair.slice(index + 1),
    url: BASE,
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax'
  };
}

async function createCustomerSession() {
  const passcode = String(randomInt(100000, 1000000));
  const suffix = String(Number(RUN_ID.slice(-7)) || 1234567).padStart(7, '0').slice(-7);
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    customerPhone = '9' + String((900000000 + Number(suffix) + attempt) % 1000000000).padStart(9, '0');
    const result = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'WaterNow Production QA', phone: customerPhone, passcode, whatsappOptIn: false },
      expected: [200, 409]
    });
    if (result.status === 200) {
      customerCookie = result.cookie;
      customerId = result.data.customerId;
      requireData(customerId && customerCookie, 'Customer registration did not return a valid authenticated session.');
      return;
    }
    lastError = result.data?.error || 'Test customer phone was already registered.';
  }
  throw new Error('Could not create a unique synthetic QA customer: ' + lastError);
}

async function ensureCoupon() {
  const code = 'WATERNOW30';
  const list = await request('/api/admin/coupons', { cookie: adminCookie });
  const existing = (list.data.coupons || []).find(item => String(item.code).toUpperCase() === code);
  const payload = {
    code,
    title: 'WaterNow ₹30 off',
    discountAmount: 30,
    startsOn: istDate(0),
    endsOn: null,
    maxRedemptions: 10,
    perCustomerLimit: 5,
    firstOrderOnly: false,
    active: true
  };
  let result;
  if (existing) {
    requireData(Number(existing.discountAmount) === 30, 'Existing WATERNOW30 coupon has a different discount; refusing to overwrite it.');
    result = await request('/api/admin/coupons/' + encodeURIComponent(existing.id), {
      method: 'PATCH', body: payload, cookie: adminCookie
    });
  } else {
    result = await request('/api/admin/coupons', {
      method: 'POST', body: payload, cookie: adminCookie, expected: [201]
    });
  }
  const coupon = result.data.coupon;
  requireData(coupon && coupon.code === code && Number(coupon.discountAmount) === 30 && coupon.active === true,
    'The fixed ₹30 coupon was not saved as expected.');
  record('Fixed ₹30 coupon ready', { code, discountAmount: Number(coupon.discountAmount), maxRedemptions: coupon.maxRedemptions });
  return coupon;
}

async function createOrder({ items, couponCode = '', date, expectedTotal }) {
  const address = { ...STORE_ADDRESS, deliveryPhone: customerPhone };
  const quote = await request('/api/checkout/quote', {
    method: 'POST',
    cookie: customerCookie,
    body: { items, couponCode, storeId: STORE_ID }
  });
  const pricing = quote.data.pricing;
  requireData(pricing && Number(pricing.finalTotal) === expectedTotal, 'Server checkout quote total mismatch: ' + JSON.stringify(pricing));
  const order = await request('/api/orders', {
    method: 'POST',
    expected: [201],
    cookie: customerCookie,
    body: {
      customerId,
      customer: { name: 'WaterNow Production QA', phone: customerPhone },
      address,
      items,
      couponCode,
      expectedTotal,
      preferredDeliveryDate: date,
      storeId: STORE_ID,
      whatsappOptIn: false
    }
  });
  requireData(order.data?.id && order.data.status === 'New', 'Production customer order was not created in New status.');
  createdOrderIds.push(order.data.id);
  record('Production checkout order created', {
    orderId: order.data.id,
    couponCode: couponCode || null,
    itemsSubtotal: pricing.itemsSubtotal,
    deliveryFee: pricing.deliveryFee,
    couponDiscount: pricing.couponDiscount,
    total: pricing.finalTotal,
    deliveryDate: date
  });
  return order.data;
}

async function subscribePush(page, kind, id) {
  await page.goto(kind === 'owner' ? BASE + '/admin/' : BASE + '/', { waitUntil: 'domcontentloaded' });
  const script = async ({ kind, customerId }) => {
    const publicPath = kind === 'owner' ? '/api/admin/push/public-key' : '/api/push/public-key';
    const publicResponse = await fetch(publicPath, { credentials: 'include', cache: 'no-store' });
    const publicData = await publicResponse.json();
    if (!publicResponse.ok || !publicData.publicKey) throw new Error('VAPID public key unavailable: ' + publicResponse.status);
    const workerPath = kind === 'owner' ? '/admin/sw.js' : '/sw.js';
    const scope = kind === 'owner' ? '/admin/' : '/';
    const registration = await navigator.serviceWorker.register(workerPath, { scope, updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    const key = publicData.publicKey;
    const padded = key + '='.repeat((4 - key.length % 4) % 4);
    const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    const applicationServerKey = Uint8Array.from(raw, char => char.charCodeAt(0));
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey
    });
    const path = kind === 'owner' ? '/api/admin/push/subscribe' : '/api/push/subscribe';
    const payload = kind === 'owner'
      ? { subscription: subscription.toJSON() }
      : { customerId, subscription: subscription.toJSON() };
    const saved = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const savedData = await saved.json().catch(() => ({}));
    if (!saved.ok || savedData.ok !== true) throw new Error('Push subscription save failed: ' + saved.status + ' ' + JSON.stringify(savedData));
    return { endpointHost: new URL(subscription.endpoint).hostname, saved: true };
  };
  return page.evaluate(script, { kind, customerId: kind === 'customer' ? id : '' });
}

async function waitForNotification(page, matcher, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const notifications = await page.evaluate(async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const all = await Promise.all(registrations.map(reg => reg.getNotifications()));
        return all.flat().map(item => ({ title: item.title, body: item.body }));
      });
      const found = notifications.find(item => matcher(item));
      if (found) return found;
    } catch { /* allow service-worker start-up and push dispatch to settle */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return null;
}

async function ownerPatch(orderId, body) {
  return request('/api/admin/orders/' + encodeURIComponent(orderId), {
    method: 'PATCH', body, cookie: adminCookie
  });
}

async function markAllAsTestOrders() {
  for (const id of createdOrderIds) {
    try {
      const result = await ownerPatch(id, { isTestOrder: true });
      requireData(result.data.isTestOrder === 1 || result.data.isTestOrder === true,
        'Could not isolate QA order ' + id + ' from live sales and reports.');
    } catch (error) {
      console.error('QA cleanup classification failed for ' + id + ': ' + error.message);
      throw error;
    }
  }
}

async function main() {
  requireData(ADMIN_TOKEN.length >= 6, 'Missing WATERNOW_ADMIN_TOKEN GitHub Actions secret. Add the current Owner test code as a repository Actions secret; no production records were changed.');
  const adminLogin = await request('/api/admin/login', {
    method: 'POST', body: { token: ADMIN_TOKEN }, expected: [200]
  });
  adminCookie = adminLogin.cookie;
  requireData(adminCookie, 'Owner login did not issue its secure session cookie.');
  const adminStatus = await request('/api/admin/status', { cookie: adminCookie });
  requireData(adminStatus.data.ok === true && adminStatus.data.pushConfigured === true,
    'Owner authentication or production push configuration is not healthy.');
  record('Owner authentication and notification configuration');

  const coupon = await ensureCoupon();
  await createCustomerSession();
  record('Customer registration and six-digit passcode session', { phoneLast4: customerPhone.slice(-4) });

  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  customerContext = await browser.newContext({ permissions: ['notifications'] });
  await customerContext.addCookies([browserCookie(customerCookie)]);
  customerPage = await customerContext.newPage();
  customerPush = await subscribePush(customerPage, 'customer', customerId);
  record('Customer push subscription saved', { endpointHost: customerPush.endpointHost });

  ownerContext = await browser.newContext({ permissions: ['notifications'] });
  await ownerContext.addCookies([browserCookie(adminCookie)]);
  ownerPage = await ownerContext.newPage();
  ownerPush = await subscribePush(ownerPage, 'owner', '');
  record('Owner push subscription saved', { endpointHost: ownerPush.endpointHost });

  const store = await request('/api/delivery/store', {
    method: 'POST', body: { address: STORE_ADDRESS }
  });
  requireData(store.data.available === true && store.data.store?.id === STORE_ID,
    'QA delivery address did not resolve to the active Boduppal store.');
  record('Boduppal delivery store resolved', { store: store.data.store.name });

  const today = istDate(0);
  const tomorrow = istDate(1);
  const customerItems = [
    { id: 'water-20l', qty: 1 },
    { id: 'p-mw99d1uv-vx6mg', qty: 1 }
  ];
  const cancellationQuote = await request('/api/checkout/quote', {
    method: 'POST', cookie: customerCookie,
    body: { items: customerItems, couponCode: 'WATERNOW30', storeId: STORE_ID }
  });
  requireData(Number(cancellationQuote.data.pricing?.itemsSubtotal) === 50 &&
    Number(cancellationQuote.data.pricing?.deliveryFee) === 30 &&
    Number(cancellationQuote.data.pricing?.couponDiscount) === 30 &&
    Number(cancellationQuote.data.pricing?.finalTotal) === 50,
    '₹30 coupon pricing did not match the 20L + 10L test basket.');

  const beforeReports = await request('/api/admin/reports?range=custom&from=' + today + '&to=' + today, { cookie: adminCookie });
  const beforeSummary = await request('/api/admin/summary', { cookie: adminCookie });

  // Test the customer-initiated cancellation path using the real production order API.
  const customerCancelOrder = await createOrder({
    items: customerItems, couponCode: 'WATERNOW30', date: tomorrow, expectedTotal: 50
  });
  const customerCancel = await request('/api/orders/' + encodeURIComponent(customerCancelOrder.id) + '/cancel', {
    method: 'POST', cookie: customerCookie,
    body: { reason: 'WaterNow QA: customer cancellation and reservation-release test.' }
  });
  requireData(customerCancel.data.status === 'Cancelled', 'Customer cancellation did not immediately cancel a New order.');
  const customerCancelPayment = await ownerPatch(customerCancelOrder.id, { payment: 'Cancelled' });
  requireData(customerCancelPayment.data.payment === 'Cancelled', 'Owner could not set cancelled payment state.');
  record('Customer cancellation and cancelled payment state', { orderId: customerCancelOrder.id });

  // Test an Owner-initiated cancellation as a separate real order.
  const ownerCancelOrder = await createOrder({ items: customerItems, date: tomorrow, expectedTotal: 80 });
  const ownerCancel = await ownerPatch(ownerCancelOrder.id, { status: 'Cancelled' });
  requireData(ownerCancel.data.status === 'Cancelled', 'Owner cancellation did not persist.');
  const ownerCancelPayment = await ownerPatch(ownerCancelOrder.id, { payment: 'Cancelled' });
  requireData(ownerCancelPayment.data.payment === 'Cancelled', 'Owner cancelled-payment variation did not persist.');
  record('Owner cancellation and cancelled payment state', { orderId: ownerCancelOrder.id });

  const availabilityAfterCancellation = await request('/api/delivery/availability', {
    method: 'POST',
    body: { address: STORE_ADDRESS, items: [{ id: 'water-20l', qty: 5 }, { id: 'p-mw99d1uv-vx6mg', qty: 5 }] }
  });
  requireData(availabilityAfterCancellation.data.available === true,
    'Cancelled QA orders did not release store reservations for the full 5 + 5 basket.');
  record('Cancelled orders released store reservations');

  const quoteFive = await request('/api/checkout/quote', {
    method: 'POST', cookie: customerCookie,
    body: { items: [{ id: 'water-20l', qty: 5 }, { id: 'p-mw99d1uv-vx6mg', qty: 5 }], couponCode: '', storeId: STORE_ID }
  });
  requireData(Number(quoteFive.data.pricing?.itemsSubtotal) === 250 &&
    Number(quoteFive.data.pricing?.deliveryFee) === 30 &&
    Number(quoteFive.data.pricing?.finalTotal) === 280,
    '5 + 5 basket pricing changed from the authoritative ₹30/₹20 product prices.');

  const lifecycleOrder = await createOrder({
    items: [{ id: 'water-20l', qty: 5 }, { id: 'p-mw99d1uv-vx6mg', qty: 5 }],
    date: tomorrow,
    expectedTotal: 280
  });

  // Customer and Owner date changes are intentionally date-only; no slot endpoints are used.
  const customerDate = istDate(2);
  const customerReschedule = await request('/api/orders/' + encodeURIComponent(lifecycleOrder.id) + '/reschedule', {
    method: 'POST', cookie: customerCookie,
    body: { requestedDeliveryDate: customerDate }
  });
  requireData(customerReschedule.data.scheduledDelivery?.date === customerDate,
    'Customer date-only reschedule did not persist.');
  const ownerDate = istDate(3);
  const ownerReschedule = await request('/api/admin/delivery/orders/' + encodeURIComponent(lifecycleOrder.id) + '/schedule', {
    method: 'PATCH', cookie: adminCookie,
    body: { deliveryDate: ownerDate, reason: 'WaterNow QA: Owner date-only reschedule.' }
  });
  requireData(ownerReschedule.data.scheduledDelivery?.date === ownerDate,
    'Owner date-only reschedule did not persist.');
  record('Customer and Owner date-only rescheduling', { customerDate, ownerDate });

  // Exercise the full supported status path and payment transitions in production.
  for (const status of ['Confirmed', 'Processing', 'Ready', 'Out for Delivery', 'Delivered']) {
    const saved = await ownerPatch(lifecycleOrder.id, { status });
    requireData(saved.data.status === status, 'Order status failed to persist: ' + status);
    record('Owner order status → ' + status, { orderId: lifecycleOrder.id });
  }
  const collected = await ownerPatch(lifecycleOrder.id, { payment: 'Collected' });
  requireData(collected.data.payment === 'Collected', 'Collected payment state did not persist.');
  const refunded = await ownerPatch(lifecycleOrder.id, { payment: 'Refunded' });
  requireData(refunded.data.payment === 'Refunded', 'Refunded payment state did not persist.');
  record('Owner payment transitions: Not Collected → Collected → Refunded', { orderId: lifecycleOrder.id });

  // General customer support message, Owner reply, customer read state.
  const message = await request('/api/customer/messages', {
    method: 'POST', cookie: customerCookie, expected: [201],
    body: { subject: 'WaterNow production QA support test', message: 'Please confirm the support message and reply flow for this QA order.' }
  });
  const messageId = message.data.id;
  requireData(messageId, 'Customer support message was not saved.');
  const ownerMessages = await request('/api/admin/customer-messages?status=pending', { cookie: adminCookie });
  requireData((ownerMessages.data.messages || []).some(item => item.id === messageId),
    'Owner inbox did not show the customer message.');
  const messageReply = await request('/api/admin/customer-messages/' + encodeURIComponent(messageId) + '/reply', {
    method: 'PATCH', cookie: adminCookie,
    body: { reply: 'WaterNow QA: your support message and Owner reply were saved successfully.' }
  });
  requireData(messageReply.data.ok === true, 'Owner could not reply to the customer message.');
  const customerMessages = await request('/api/customer/messages', { cookie: customerCookie });
  requireData((customerMessages.data.messages || []).some(item => item.id === messageId && item.status === 'replied'),
    'Customer could not read the Owner reply.');
  const markedRead = await request('/api/customer/messages/read', { method: 'PATCH', cookie: customerCookie, body: {} });
  requireData(markedRead.data.ok === true, 'Customer message read state could not be saved.');
  record('Customer support inbox, Owner reply, and customer read state', { messageId });

  // Also verify order-linked issue requests and Owner replies.
  const issue = await request('/api/orders/' + encodeURIComponent(lifecycleOrder.id) + '/request', {
    method: 'POST', cookie: customerCookie, expected: [202],
    body: { requestType: 'issue', reason: 'WaterNow QA: order-specific delivery support request.' }
  });
  const requestId = issue.data.request?.requestId;
  requireData(requestId, 'Order-specific issue request was not created.');
  const orderReply = await request('/api/admin/customer-messages/order-requests/' + encodeURIComponent(requestId) + '/reply', {
    method: 'PATCH', cookie: adminCookie,
    body: { reply: 'WaterNow QA: the order-specific support request was received and answered.' }
  });
  requireData(orderReply.data.ok === true, 'Owner could not reply to the order-specific issue request.');
  record('Order-specific customer issue request and Owner reply', { requestId });

  // Reports must include the newly created orders before they are classified as QA.
  const reportsBeforeIsolation = await request('/api/admin/reports?range=custom&from=' + today + '&to=' + today, { cookie: adminCookie });
  const expectedTotalOrders = Number(beforeReports.data.totalOrders || 0) + 3;
  requireData(Number(reportsBeforeIsolation.data.totalOrders || 0) >= expectedTotalOrders,
    'Production reports did not include the three new orders before QA classification.');
  requireData(Number(reportsBeforeIsolation.data.cancelled || 0) >= Number(beforeReports.data.cancelled || 0) + 2,
    'Production reports did not reflect the two cancelled orders.');
  record('Sales and cancellation report includes QA orders before isolation', {
    totalOrders: reportsBeforeIsolation.data.totalOrders,
    eligibleOrders: reportsBeforeIsolation.data.eligibleOrders,
    cancelled: reportsBeforeIsolation.data.cancelled,
    cashCollected: reportsBeforeIsolation.data.cashCollected
  });

  // Order and notification history is inspected before classifying the orders as tests.
  const ownerAlerts = await request('/api/admin/order-alerts?limit=100', { cookie: adminCookie });
  const relevantAlerts = (ownerAlerts.data.alerts || []).filter(item =>
    createdOrderIds.some(id => String(item.order_id || item.orderId || '').includes(id))
  );
  record('Owner notification event history inspected', {
    totalOwnerAlerts: (ownerAlerts.data.alerts || []).length,
    qaOrderAlerts: relevantAlerts.length
  });

  // Mark every created order as a QA order so live order views and reports exclude it.
  await markAllAsTestOrders();
  const testList = await request('/api/admin/orders?testOrders=1&limit=50', { cookie: adminCookie });
  const visibleTestIds = new Set((testList.data.orders || []).map(item => item.id));
  requireData(createdOrderIds.every(id => visibleTestIds.has(id)),
    'One or more completed QA orders are missing from the Owner Test Orders view.');
  const liveList = await request('/api/admin/orders?limit=50', { cookie: adminCookie });
  requireData(!createdOrderIds.some(id => (liveList.data.orders || []).some(item => item.id === id)),
    'A QA order leaked into the normal Owner live-orders list.');
  const reportsAfterIsolation = await request('/api/admin/reports?range=custom&from=' + today + '&to=' + today, { cookie: adminCookie });
  requireData(Number(reportsAfterIsolation.data.totalOrders || 0) <= Number(beforeReports.data.totalOrders || 0),
    'Classified QA orders are still included in production reports.');
  const afterSummary = await request('/api/admin/summary', { cookie: adminCookie });
  requireData(Number(afterSummary.data.customers || 0) >= Number(beforeSummary.data.customers || 0),
    'Owner summary could not be loaded after the production test.');
  record('QA orders isolated from live orders and reports', {
    testOrders: createdOrderIds.length,
    reportsTotalBeforeIsolation: reportsBeforeIsolation.data.totalOrders,
    reportsTotalAfterIsolation: reportsAfterIsolation.data.totalOrders,
    customerVisibleOrders: (await request('/api/orders?customerId=' + encodeURIComponent(customerId), { cookie: customerCookie })).data.orders?.length || 0
  });

  const redemptions = await request('/api/admin/coupons/' + encodeURIComponent(coupon.id) + '/redemptions', { cookie: adminCookie });
  requireData((redemptions.data.redemptions || []).some(item => item.orderId === customerCancelOrder.id && Number(item.discountAmount) === 30),
    'Coupon redemption history did not record the fixed ₹30 production test redemption.');
  record('₹30 coupon redemption history verified', { code: coupon.code, redemptions: (redemptions.data.redemptions || []).length });

  // A genuine Owner push test uses the current configured VAPID credentials and browser subscription.
  const pushTest = await request('/api/admin/push/test', { method: 'POST', cookie: adminCookie, body: {} });
  record('Owner push test endpoint', {
    status: pushTest.data.status || 'unknown',
    sent: Number(pushTest.data.sent || 0),
    failed: Number(pushTest.data.failed || 0),
    subscriptions: Number(pushTest.data.ownerSubscriptionCount || 0)
  });

  const customerNotification = customerPage
    ? await waitForNotification(customerPage, item => /WaterNow|order/i.test(item.title + ' ' + item.body), 15000)
    : null;
  const ownerNotification = ownerPage
    ? await waitForNotification(ownerPage, item => /WaterNow|order/i.test(item.title + ' ' + item.body), 15000)
    : null;
  record('Browser notification receipt inspected', {
    customerReceived: Boolean(customerNotification),
    ownerReceived: Boolean(ownerNotification),
    pushTestSent: Number(pushTest.data.sent || 0)
  });

  const summary = {
    result: 'completed',
    createdOrderIds,
    coupon: { code: coupon.code, discountAmount: 30, redemptionCount: (redemptions.data.redemptions || []).length },
    customerPhoneLast4: customerPhone.slice(-4),
    store: STORE_ID,
    dateOnlyScheduling: true,
    statusesVerified: ['New', 'Confirmed', 'Processing', 'Ready', 'Out for Delivery', 'Delivered', 'Cancelled'],
    paymentStatesVerified: ['Not Collected', 'Collected', 'Refunded', 'Cancelled'],
    reportsVerified: true,
    supportMessagesVerified: true,
    orderRequestsVerified: true,
    testOrdersIsolated: true,
    push: {
      customerSubscription: Boolean(customerPush),
      ownerSubscription: Boolean(ownerPush),
      ownerTestSent: Number(pushTest.data.sent || 0),
      customerNotificationReceived: Boolean(customerNotification),
      ownerNotificationReceived: Boolean(ownerNotification)
    },
    results
  };
  console.log('WATERNOW_PRODUCTION_ACCEPTANCE_RESULT=' + JSON.stringify(summary));
  if (!customerPush || !ownerPush || Number(pushTest.data.sent || 0) < 1 ||
      !customerNotification || !ownerNotification) {
    throw new Error('Order lifecycle passed, but actual push delivery was not confirmed on both QA browser devices.');
  }
}

let customerPush = null;
let ownerPush = null;
try {
  await main();
} catch (error) {
  console.error('WaterNow production acceptance failed:', error?.stack || error);
  // Keep any partially-created production orders out of customer/live sales views.
  if (adminCookie && createdOrderIds.length) {
    for (const id of createdOrderIds) {
      try {
        const result = await ownerPatch(id, { isTestOrder: true });
        console.log('QA order isolated after interrupted test:', id, result.data?.isTestOrder);
      } catch (classificationError) {
        console.error('CRITICAL: Could not classify partial QA order ' + id + ': ' + classificationError.message);
      }
    }
  }
  process.exitCode = 1;
} finally {
  try { if (customerContext) await customerContext.close(); } catch {}
  try { if (ownerContext) await ownerContext.close(); } catch {}
  try { if (browser) await browser.close(); } catch {}
}
