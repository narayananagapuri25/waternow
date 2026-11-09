import { test, expect } from '@playwright/test';

function istDatePlus(days) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
  const [year, month, day] = today.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

test('Owner signs in, updates payment and delivery date, and cancels an order', async ({ page }) => {
  const orderId = 'WN-E2E-ORDER-0001';
  const initialDate = istDatePlus(1);
  const rescheduledDate = istDatePlus(3);
  const patches = [];
  const scheduleWrites = [];

  const order = {
    id: orderId,
    createdAt: new Date().toISOString(),
    status: 'New',
    payment: 'Not Collected',
    deliveryPlan: 'Tomorrow',
    total: 240,
    itemsSubtotal: 240,
    deliveryFee: 0,
    items: [{ name: '20L Drinking Water Can', unit: 'can', qty: 1, price: 240, lineTotal: 240 }],
    customer: {
      id: 'customer-e2e',
      name: 'WaterNow Test Customer',
      phone: '919000000001',
      registeredPhone: '919000000001',
      deliveryPhone: '919000000002'
    },
    address: {
      house: '5-20',
      area: 'Boduppal',
      city: 'Hyderabad',
      state: 'Telangana',
      pincode: '500092',
      deliveryPhone: '919000000002',
      latitude: 17.4139,
      longitude: 78.5783
    },
    assignedStoreName: 'WaterNow E2E Test Store',
    scheduledDelivery: {
      date: initialDate,
      slotId: 'slot-e2e',
      startTime: '09:00',
      endTime: '11:00',
      startMinute: 540,
      endMinute: 660
    },
    isTestOrder: false,
    pricingBreakdownKnown: true
  };

  const json = (body, status = 200) => ({
    status,
    contentType: 'application/json',
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-credentials': 'true'
    },
    body: JSON.stringify(body)
  });

  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.pathname === '/api/admin/login' && method === 'POST') {
      const body = request.postDataJSON();
      expect(body.token).toBe('local-e2e-only-token');
      return route.fulfill(json({ ok: true, version: 'e2e' }));
    }

    if (url.pathname === '/api/admin/summary' && method === 'GET') {
      return route.fulfill(json({
        newOrders: order.status === 'New' ? 1 : 0,
        processing: order.status === 'Processing' ? 1 : 0,
        deliveryToday: 0,
        cashPending: order.payment === 'Not Collected' && order.status !== 'Cancelled' ? order.total : 0
      }));
    }

    if (url.pathname === '/api/admin/reports' && method === 'GET') {
      return route.fulfill(json({
        sales: order.status === 'Cancelled' ? 0 : order.total,
        orders: order.status === 'Cancelled' ? 0 : 1,
        cashPending: order.payment === 'Not Collected' && order.status !== 'Cancelled' ? order.total : 0,
        cashPendingOrders: order.payment === 'Not Collected' && order.status !== 'Cancelled' ? 1 : 0,
        cashCollected: order.payment === 'Collected' ? order.total : 0,
        delivered: 0,
        deliveredSales: 0,
        customers: 1,
        newCustomers: 1
      }));
    }

    if (url.pathname === '/api/admin/orders' && method === 'GET') {
      return route.fulfill(json({
        orders: [{ ...order, items: order.items.map(item => ({ ...item })), scheduledDelivery: { ...order.scheduledDelivery } }],
        pagination: { total: 1, page: 1, limit: 25 }
      }));
    }

    if (url.pathname === `/api/admin/orders/${orderId}` && method === 'PATCH') {
      const patch = request.postDataJSON();
      patches.push({ ...patch });
      if (patch.status) order.status = patch.status;
      if (patch.payment) order.payment = patch.payment;
      if (Object.hasOwn(patch, 'isTestOrder')) order.isTestOrder = patch.isTestOrder;
      return route.fulfill(json({ status: order.status, payment: order.payment, isTestOrder: order.isTestOrder ? 1 : 0 }));
    }

    if (url.pathname === `/api/admin/delivery/orders/${orderId}/schedule` && method === 'PATCH') {
      const body = request.postDataJSON();
      scheduleWrites.push({ ...body });
      order.scheduledDelivery = {
        date: body.deliveryDate,
        slotId: null,
        startTime: '',
        endTime: '',
        startMinute: null,
        endMinute: null
      };
      order.deliveryPlan = 'Later';
      return route.fulfill(json({ scheduledDelivery: { date: body.deliveryDate } }));
    }

    if (url.pathname === '/api/admin/customers' && method === 'GET') {
      return route.fulfill(json({ customers: [], pagination: { total: 0, page: 1, limit: 25 } }));
    }

    if (url.pathname === '/api/admin/products' && method === 'GET') {
      return route.fulfill(json({ products: [] }));
    }

    // Modules outside this order-lifecycle journey may issue optional reads.
    return route.fulfill(json({ ok: true, alerts: [], notifications: [], products: [], categories: [] }));
  });

  await page.goto('/admin.html#orders');
  await page.getByPlaceholder('Worker ADMIN_TOKEN').fill('local-e2e-only-token');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.locator('#appView')).toBeVisible();
  const orderCard = page.locator(`#ordersList [data-order="${orderId}"]`);
  await expect(orderCard).toBeVisible();
  await orderCard.click();

  await expect(page.locator('#fwLifeStatus')).toHaveValue('New');
  await expect(page.locator('#fwLifePayment')).toHaveValue('Not Collected');
  await expect(page.locator('#fwLifeDeliveryDate')).toHaveValue(initialDate);
  await expect(page.locator('#modalBody')).toContainText('Registered mobile');
  await expect(page.locator('#modalBody')).toContainText('Delivery mobile');
  await expect(page.locator('#modalBody')).toContainText('WaterNow E2E Test Store');

  await page.locator('#fwLifePayment').selectOption('Collected');
  await expect.poll(() => patches.some(patch => patch.payment === 'Collected')).toBe(true);
  await expect(page.locator('#fwLifePayment')).toHaveValue('Collected');

  await page.locator('#fwLifeDeliveryDate').fill(rescheduledDate);
  await page.locator('[data-life-save-date]').click();
  await expect.poll(() => scheduleWrites.some(write => write.deliveryDate === rescheduledDate)).toBe(true);
  await expect(page.locator('#fwLifeDeliveryDate')).toHaveValue(rescheduledDate);

  await page.locator('#fwLifeStatus').selectOption('Cancelled');
  await expect.poll(() => patches.some(patch => patch.status === 'Cancelled')).toBe(true);
  await expect(page.locator('#fwLifeStatus')).toHaveValue('Cancelled');
  await expect(page.locator('#fwLifeSave')).toContainText('Saved');
  await expect(page.locator('#fwLifeDeliveryDate')).toHaveCount(0);
});
