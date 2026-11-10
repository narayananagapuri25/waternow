import assert from 'node:assert/strict';

const BASE = (process.env.WATERNOW_APP_ORIGIN || 'https://waternow.pages.dev').replace(/\/$/, '');
const ADDRESS = {
  house: 'QA Test House — Brindavan Colony',
  area: 'Brindavan Colony',
  city: 'Boduppal',
  district: 'Medchal-Malkajgiri',
  state: 'Telangana',
  pincode: '500092',
  latitude: 17.415,
  longitude: 78.585
};
const ITEMS_ONE = [
  { id: 'water-20l', qty: 1 },
  { id: 'p-mw99d1uv-vx6mg', qty: 1 }
];
const ITEMS_FIVE = [
  { id: 'water-20l', qty: 5 },
  { id: 'p-mw99d1uv-vx6mg', qty: 5 }
];
const checks = [];

async function request(path, { method = 'GET', body, expected = [200] } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      Origin: BASE,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
    cache: 'no-store'
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw: raw.slice(0, 500) }; }
  assert.ok(expected.includes(response.status),
    `${method} ${path} returned HTTP ${response.status}: ${JSON.stringify(data).slice(0, 900)}`);
  return { response, data };
}

function pass(name, detail = {}) {
  checks.push({ name, passed: true, ...detail });
  console.log('PASS ' + name + (Object.keys(detail).length ? ' ' + JSON.stringify(detail) : ''));
}

function istDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = {};
  for (const part of parts) values[part.type] = part.value;
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + offsetDays));
  return date.toISOString().slice(0, 10);
}

async function quote(items, couponCode = '') {
  const { data } = await request('/api/checkout/quote', {
    method: 'POST',
    body: { storeId: 'waternow-boduppal', couponCode, items }
  });
  return data.pricing;
}

async function main() {
  const health = await request('/api/health');
  assert.equal(health.data.ok, true);
  assert.equal(health.data.service, 'waternow-api');
  pass('Production Worker health');

  for (const path of ['/', '/admin/']) {
    const { response } = await request(path);
    assert.match(response.headers.get('content-type') || '', /text\/html/i);
    pass(path === '/' ? 'Customer app HTML' : 'Owner app HTML', { status: response.status });
  }

  const products = (await request('/api/products')).data.products || [];
  const twenty = products.find(item => item.id === 'water-20l');
  const ten = products.find(item => item.id === 'p-mw99d1uv-vx6mg');
  assert.ok(twenty && ten, 'One of the two authorised WaterNow products is missing.');
  assert.equal(twenty.name, '20L Drinking Water Can');
  assert.equal(Number(twenty.price), 30);
  assert.equal(ten.name, '10L Drinking Water Can');
  assert.equal(Number(ten.price), 20);
  pass('Exact customer catalogue and authorised prices', {
    products: [{ id: twenty.id, price: Number(twenty.price) }, { id: ten.id, price: Number(ten.price) }]
  });

  const coupons = (await request('/api/coupons/available')).data.coupons || [];
  const coupon = coupons.find(item => String(item.code).toUpperCase() === 'WATERNOW30');
  assert.ok(coupon, 'The fixed ₹30 WaterNow QA coupon is not publicly available.');
  assert.equal(Number(coupon.discountAmount), 30);
  assert.equal(coupon.eligible, true);
  pass('Fixed ₹30 coupon is available', {
    code: coupon.code, discountAmount: Number(coupon.discountAmount),
    usedCount: Number(coupon.usedCount || 0), maxRedemptions: coupon.maxRedemptions
  });

  const resolved = await request('/api/delivery/store', {
    method: 'POST', body: { address: ADDRESS }
  });
  assert.equal(resolved.data.available, true);
  assert.equal(resolved.data.store?.id, 'waternow-boduppal');
  pass('Boduppal map pin resolves to the active store', { store: resolved.data.store });

  for (const [label, items] of [['1+1 basket', ITEMS_ONE], ['5+5 basket', ITEMS_FIVE]]) {
    const availability = await request('/api/delivery/availability', {
      method: 'POST', body: { address: ADDRESS, items }
    });
    assert.equal(availability.data.available, true, availability.data.message);
    assert.equal(availability.data.store?.id, 'waternow-boduppal');
    pass('Delivery availability: ' + label, { code: availability.data.code, store: availability.data.store.id });
  }

  const outside = await request('/api/delivery/availability', {
    method: 'POST',
    body: { address: { ...ADDRESS, latitude: 17.5, longitude: 78.7 }, items: ITEMS_ONE }
  });
  assert.equal(outside.data.available, false);
  assert.equal(outside.data.code, 'AREA_UNAVAILABLE');
  pass('Out-of-radius address is rejected');

  const slots = await request('/api/delivery/slots', {
    method: 'POST',
    body: { date: istDate(1), address: ADDRESS, items: ITEMS_ONE }
  });
  assert.equal(slots.data.enabled, false);
  assert.deepEqual(slots.data.slots, []);
  pass('Date-only delivery remains enabled; time slots remain disabled');

  const normal = await quote(ITEMS_ONE);
  assert.equal(Number(normal.itemsSubtotal), 50);
  assert.equal(Number(normal.deliveryFee), 30);
  assert.equal(Number(normal.couponDiscount), 0);
  assert.equal(Number(normal.finalTotal), 80);
  pass('Checkout quote without coupon', { subtotal: normal.itemsSubtotal, delivery: normal.deliveryFee, total: normal.finalTotal });

  const discounted = await quote(ITEMS_ONE, 'WATERNOW30');
  assert.equal(Number(discounted.itemsSubtotal), 50);
  assert.equal(Number(discounted.deliveryFee), 30);
  assert.equal(Number(discounted.couponDiscount), 30);
  assert.equal(Number(discounted.finalTotal), 50);
  pass('Checkout quote applies exactly ₹30 discount', { subtotal: discounted.itemsSubtotal, delivery: discounted.deliveryFee, discount: discounted.couponDiscount, total: discounted.finalTotal });

  const five = await quote(ITEMS_FIVE, 'WATERNOW30');
  assert.equal(Number(five.itemsSubtotal), 250);
  assert.equal(Number(five.deliveryFee), 30);
  assert.equal(Number(five.couponDiscount), 30);
  assert.equal(Number(five.finalTotal), 250);
  pass('5+5 checkout arithmetic', { subtotal: five.itemsSubtotal, delivery: five.deliveryFee, discount: five.couponDiscount, total: five.finalTotal });

  const threshold = await quote([{ id: 'water-20l', qty: 20 }, { id: 'p-mw99d1uv-vx6mg', qty: 10 }]);
  assert.equal(Number(threshold.itemsSubtotal), 800);
  assert.equal(threshold.qualifiesForFreeDelivery, true);
  assert.equal(Number(threshold.deliveryFee), 0);
  assert.equal(Number(threshold.finalTotal), 800);
  pass('₹800 free-delivery threshold');

  await request('/api/checkout/quote', {
    method: 'POST', body: { storeId: 'waternow-boduppal', items: [{ id: 'water-20l', qty: 0 }] }, expected: [400]
  });
  pass('Invalid zero quantity rejected');

  for (const path of ['/api/admin/orders', '/api/admin/reports?range=week']) {
    await request(path, { expected: [401] });
    pass('Owner API protected without session: ' + path, { status: 401 });
  }

  await request('/api/orders', { expected: [401] });
  pass('Customer order history requires a customer session');

  await request('/api/customer/messages', { expected: [401] });
  pass('Customer support inbox requires a customer session');

  await request('/api/customer/messages', {
    method: 'POST',
    body: { subject: 'Unauthenticated QA probe', message: 'This request must be rejected.' },
    expected: [401]
  });
  pass('Unauthenticated customer support message cannot be created');

  await request('/api/orders', {
    method: 'POST',
    body: { customer: { name: 'QA', phone: '9999999999' }, items: [], expectedTotal: 0, preferredDeliveryDate: istDate(1) },
    expected: [401]
  });
  pass('Unauthenticated customer cannot create an order');

  await request('/api/auth/register', {
    method: 'POST',
    body: { name: 'Invalid QA', phone: '123', passcode: '1234', whatsappOptIn: false },
    expected: [400]
  });
  pass('Invalid customer registration is rejected');

  await request('/api/auth/login', {
    method: 'POST',
    body: { phone: '123', passcode: '1234' },
    expected: [400]
  });
  pass('Invalid customer login is rejected');

  await request('/api/admin/login', {
    method: 'POST',
    body: {},
    expected: [401]
  });
  pass('Empty Owner login is rejected');

  console.log(JSON.stringify({ passed: checks.length, failed: 0, checks }, null, 2));
}

main().catch(error => {
  console.error('PRODUCTION PUBLIC SMOKE FAILED: ' + (error?.stack || error));
  process.exitCode = 1;
});
