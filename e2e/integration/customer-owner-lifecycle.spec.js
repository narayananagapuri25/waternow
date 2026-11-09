import { test, expect } from '@playwright/test';

const boduppalTestPin = Object.freeze({ latitude: 17.4137, longitude: 78.5767 });
const ownerTestAccessCode = '1234';
const testCustomer = Object.freeze({
  name: 'WaterNow E2E Customer',
  phone: '9000000001',
  passcode: '123456'
});

// These synthetic prices and stocks exist only in the disposable SQLite test DB.
// They never update the live catalogue or main/production configuration.
const testPrices = Object.freeze({
  'water-20l': 101,
  'water-10l-pair': 51
});
const testItems = Object.freeze([
  { id: 'water-20l', qty: 5 },
  // The current catalogue SKU is a pack containing two 10L cans.
  // Five packs therefore represent ten physical 10L cans.
  { id: 'water-10l-pair', qty: 5 }
]);

function istDatePlus(days) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + days));
  return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0') + '-' + String(date.getUTCDate()).padStart(2, '0');
}

async function api(page, path, method = 'GET', data = null) {
  return page.evaluate(async ({ path, method, data }) => {
    const response = await fetch(path, {
      method,
      credentials: 'include',
      cache: 'no-store',
      headers: data === null ? { accept: 'application/json' } : {
        accept: 'application/json',
        'content-type': 'application/json'
      },
      ...(data === null ? {} : { body: JSON.stringify(data) })
    });
    const body = await response.json().catch(() => ({ error: 'Response was not JSON.' }));
    return { status: response.status, ok: response.ok, body };
  }, { path, method, data });
}

async function ownerLogin(page) {
  await page.goto('/admin/');
  await expect(page.locator('#adminToken')).toBeVisible();
  await page.locator('#adminToken').fill(ownerTestAccessCode);
  await page.locator('#connectBtn').click();
  await expect(page.locator('#appView')).toBeVisible();
}

test('real customer-to-owner journey: Boduppal test store, mixed water basket, order, schedule change and cancellation', async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const customerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const customer = await customerContext.newPage();
  const pageErrors = [];
  owner.on('pageerror', error => pageErrors.push('Owner: ' + error.message));
  customer.on('pageerror', error => pageErrors.push('Customer: ' + error.message));

  try {
    // 1. Owner signs in through the real Owner login screen. 1234 is provided
    // only by the loopback-only isolated test server environment.
    await ownerLogin(owner);
    const status = await api(owner, '/api/admin/status');
    expect(status.status).toBe(200);
    expect(status.body.ok).toBe(true);

    // 2. Create a disposable Boduppal test store. The coordinates below are
    // a deterministic area-level test fixture, not a verified shop entrance
    // or a production location.
    const created = await api(owner, '/api/admin/delivery/stores', 'POST', {
      name: 'WaterNow Boduppal E2E Test Store',
      address: 'Boduppal, Hyderabad, Telangana 500092 (isolated test fixture)',
      latitude: boduppalTestPin.latitude,
      longitude: boduppalTestPin.longitude,
      serviceRadiusKm: 5
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const storeId = created.body.store.id;
    expect(storeId).toBeTruthy();
    expect(created.body.store.is_active).toBe(0);

    const activated = await api(owner, '/api/admin/delivery/stores/' + encodeURIComponent(storeId), 'PATCH', {
      isActive: true
    });
    expect(activated.status, JSON.stringify(activated.body)).toBe(200);
    expect(activated.body.store.is_active).toBe(1);

    // 3. Read the active catalogue and write prices/stock only into this
    // in-memory test database. Actual catalogue names, SKUs and live prices
    // are never edited.
    const catalogue = await api(owner, '/api/admin/catalogue');
    expect(catalogue.status, JSON.stringify(catalogue.body)).toBe(200);
    const activeCategoryIds = new Set((catalogue.body.categories || [])
      .filter(category => Number(category.active) === 1)
      .map(category => String(category.id)));
    const activeProducts = (catalogue.body.products || [])
      .filter(product => Number(product.active) === 1 && activeCategoryIds.has(String(product.category_id)));
    expect(activeProducts.map(product => product.id).sort()).toEqual(['water-10l-pair', 'water-20l'].sort());

    const storeCatalogue = await api(owner, '/api/admin/delivery/stores/' + encodeURIComponent(storeId) + '/catalogue');
    expect(storeCatalogue.status, JSON.stringify(storeCatalogue.body)).toBe(200);
    const savedCatalogue = await api(owner, '/api/admin/delivery/stores/' + encodeURIComponent(storeId) + '/catalogue', 'PATCH', {
      items: activeProducts.map(product => ({
        productId: product.id,
        isAvailable: true,
        priceOverride: testPrices[product.id]
      }))
    });
    expect(savedCatalogue.status, JSON.stringify(savedCatalogue.body)).toBe(200);
    for (const item of savedCatalogue.body.items) {
      expect(Number(item.storePrice)).toBe(testPrices[item.id]);
      expect(item.isAvailable).toBe(true);
    }

    const inventory = await api(owner, '/api/admin/delivery/stores/' + encodeURIComponent(storeId) + '/inventory');
    expect(inventory.status, JSON.stringify(inventory.body)).toBe(200);
    const inventoryItems = (inventory.body.inventory || []).filter(item => Number(item.stock_managed) === 1);
    const inventoryUpdate = await api(owner, '/api/admin/delivery/stores/' + encodeURIComponent(storeId) + '/inventory', 'PATCH', {
      items: inventoryItems.map(item => ({
        productId: item.id,
        stockQuantity: Object.hasOwn(testPrices, item.id) ? 10 : Number(item.on_hand || 0)
      }))
    });
    expect(inventoryUpdate.status, JSON.stringify(inventoryUpdate.body)).toBe(200);
    for (const id of Object.keys(testPrices)) {
      const row = inventoryUpdate.body.inventory.find(item => item.id === id);
      expect(Number(row?.on_hand)).toBe(10);
    }

    // 4. A real customer account and saved delivery address are created through
    // the Worker API. No production account or address is used.
    await customer.goto('/');
    const registration = await api(customer, '/api/auth/register', 'POST', {
      ...testCustomer,
      whatsappOptIn: false
    });
    expect(registration.status, JSON.stringify(registration.body)).toBe(200);
    const customerId = registration.body.customerId;
    expect(customerId).toBeTruthy();
    // Synchronise the real signed cookie with the PWA's existing customer
    // session boundary so the rendered My Orders screen reads the same account.
    await customer.waitForTimeout(800);
    await customer.evaluate(async id => {
      window.FreshWayNotifications.setCustomerId(id);
      await window.FreshWayNotifications.session();
      document.dispatchEvent(new CustomEvent('waternow:session'));
    }, customerId);

    const address = {
      label: 'Home',
      recipientName: testCustomer.name,
      deliveryPhone: testCustomer.phone,
      houseFlat: '5-20 Boduppal E2E Test Home',
      building: '',
      floor: '',
      street: 'Boduppal Test Road',
      area: 'Boduppal',
      locality: 'Boduppal',
      city: 'Hyderabad',
      district: 'Medchal-Malkajgiri',
      state: 'Telangana',
      pincode: '500092',
      landmark: 'Boduppal test landmark',
      note: 'Isolated test delivery only',
      latitude: boduppalTestPin.latitude,
      longitude: boduppalTestPin.longitude,
      accuracyMeters: 10,
      locationSource: 'E2E_TEST_FIXTURE',
      placeId: 'boduppal-waternow-e2e',
      isDefault: true
    };
    const addressSaved = await api(customer, '/api/addresses', 'POST', address);
    expect([200, 201], JSON.stringify(addressSaved.body)).toContain(addressSaved.status);
    expect(addressSaved.body.ok).toBe(true);

    const availability = await api(customer, '/api/delivery/availability', 'POST', {
      address,
      items: testItems,
      storeId
    });
    expect(availability.status, JSON.stringify(availability.body)).toBe(200);
    expect(availability.body.available).toBe(true);
    expect(availability.body.store.id).toBe(storeId);

    // 5. Get the server's authoritative quote and submit a real order using the
    // current WaterNow product SKUs. The 10L SKU is two cans per pack: qty 5
    // is ten physical 10L cans, not five individual 10L cans.
    const quote = await api(customer, '/api/checkout/quote', 'POST', {
      items: testItems,
      storeId
    });
    expect(quote.status, JSON.stringify(quote.body)).toBe(200);
    expect(Number(quote.body.pricing?.finalTotal)).toBeGreaterThan(0);
    expect(Number(quote.body.pricing?.itemsSubtotal)).toBe(
      testPrices['water-20l'] * 5 + testPrices['water-10l-pair'] * 5
    );

    const deliveryDate = istDatePlus(1);
    const orderResult = await api(customer, '/api/orders', 'POST', {
      customerId,
      customer: { name: testCustomer.name, phone: testCustomer.phone },
      address: {
        house: address.houseFlat,
        area: address.area,
        city: address.city,
        pincode: address.pincode,
        latitude: address.latitude,
        longitude: address.longitude,
        landmark: address.landmark,
        note: address.note,
        deliveryPhone: address.deliveryPhone
      },
      items: testItems,
      clientOrderId: 'WATERNOW-E2E-BODUPPAL-0001',
      storeId,
      expectedTotal: Number(quote.body.pricing.finalTotal),
      preferredDeliveryDate: deliveryDate,
      whatsappOptIn: false
    });
    expect(orderResult.status, JSON.stringify(orderResult.body)).toBe(201);
    const orderId = orderResult.body.id;
    expect(orderId).toMatch(/^WN-/);
    expect(orderResult.body.status).toBe('New');
    expect(orderResult.body.items).toHaveLength(2);
    expect(orderResult.body.items.find(item => item.id === 'water-20l')?.qty).toBe(5);
    expect(orderResult.body.items.find(item => item.id === 'water-10l-pair')?.qty).toBe(5);
    expect(orderResult.body.assignedStoreId).toBe(storeId);
    expect(orderResult.body.scheduledDelivery.date).toBe(deliveryDate);

    const customerOrders = await api(customer, '/api/orders?customerId=' + encodeURIComponent(customerId));
    expect(customerOrders.status, JSON.stringify(customerOrders.body)).toBe(200);
    expect(customerOrders.body.orders.some(order => order.id === orderId && order.status === 'New')).toBe(true);
    await customer.evaluate(() => window.setView('orders'));
    await expect(customer.locator('#ordersView')).toHaveClass(/active-view/);
    await expect(customer.locator('#customerOrders')).toContainText(orderId);

    // 6. Confirm the same real order appears in the Owner's live order queue,
    // including both registered and delivery contact details.
    await owner.evaluate(() => window.navigateAdminScreen('orders'));
    await expect(owner.locator('#ordersList')).toContainText(orderId);
    const ownerOrders = await api(owner, '/api/admin/orders?page=1&limit=50&search=' + encodeURIComponent(orderId));
    expect(ownerOrders.status, JSON.stringify(ownerOrders.body)).toBe(200);
    const ownerOrder = ownerOrders.body.orders.find(order => order.id === orderId);
    expect(ownerOrder).toBeTruthy();
    expect(ownerOrder.customer.name).toBe(testCustomer.name);
    expect(ownerOrder.customer.registeredPhone.endsWith(testCustomer.phone.slice(-4))).toBe(true);
    expect(ownerOrder.address.deliveryPhone.endsWith(testCustomer.phone.slice(-4))).toBe(true);
    expect(ownerOrder.address.area).toBe('Boduppal');
    expect(ownerOrder.items).toHaveLength(2);

    // 7. Owner reschedules the real order. The customer My Orders endpoint must
    // show the same updated delivery date.
    const rescheduledDate = istDatePlus(3);
    const reschedule = await api(owner, '/api/admin/delivery/orders/' + encodeURIComponent(orderId) + '/schedule', 'PATCH', {
      deliveryDate: rescheduledDate,
      reason: 'WaterNow isolated end-to-end date-change test'
    });
    expect(reschedule.status, JSON.stringify(reschedule.body)).toBe(200);
    expect(reschedule.body.scheduledDelivery.date).toBe(rescheduledDate);

    const afterReschedule = await api(customer, '/api/orders?customerId=' + encodeURIComponent(customerId));
    const rescheduledOrder = afterReschedule.body.orders.find(order => order.id === orderId);
    expect(rescheduledOrder?.scheduledDelivery?.date).toBe(rescheduledDate);
    await customer.evaluate(() => window.setView('orders'));
    await expect(customer.locator('#customerOrders')).toContainText(rescheduledDate.slice(0, 4));

    // 8. Owner cancellation releases test-store reservations and propagates to
    // the customer's actual My Orders response.
    const cancelled = await api(owner, '/api/admin/orders/' + encodeURIComponent(orderId), 'PATCH', {
      status: 'Cancelled'
    });
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    const finalOwnerOrders = await api(owner, '/api/admin/orders?page=1&limit=50&search=' + encodeURIComponent(orderId));
    const finalCustomerOrders = await api(customer, '/api/orders?customerId=' + encodeURIComponent(customerId));
    expect(finalOwnerOrders.body.orders.find(order => order.id === orderId)?.status).toBe('Cancelled');
    expect(finalCustomerOrders.body.orders.find(order => order.id === orderId)?.status).toBe('Cancelled');
    await customer.evaluate(() => window.setView('orders'));
    await expect(customer.locator('#customerOrders')).toContainText('Cancelled');

    // The isolated store profile can read/write contact metadata. It remains
    // intentionally blank until the actual parent-company email is verified;
    // never substitute an employee/personal or guessed address.
    const publicProfile = await api(customer, '/api/store-profile');
    expect(publicProfile.status, JSON.stringify(publicProfile.body)).toBe(200);
    expect(publicProfile.body.storeProfile.storeName).toBe('WaterNow');

    expect(pageErrors).toEqual([]);
  } finally {
    await customerContext.close();
    await ownerContext.close();
  }
});
