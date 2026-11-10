import { test, expect } from '@playwright/test';

test('WaterNow storefront resolves a local supplier and displays its water-pack prices',async({page})=>{
  const quoteStoreIds=[];
  const addressRequests=[];
  const resolvedStoreAddresses=[];
  const storeResolveResponses=[];
  const storeProductQueries=[];
  const apiRouteCalls=[];
  const products=[
    {id:'water-20l',name:'20L Drinking Water Can',unit:'can',price:189,emoji:'💧',active:1,category_id:'water-20l',category_name:'20L Water Can',category_slug:'20l-water-can',stock_status:'in_stock'},
    {id:'water-10l-pair',name:'2 × 10L Drinking Water Cans',unit:'pack',price:149,emoji:'🚰',active:1,category_id:'water-10l-pair',category_name:'2 × 10L Water Cans',category_slug:'two-10l-water-cans',stock_status:'in_stock'},
    {id:'water-10l',name:'10L Drinking Water Can',unit:'bottle',price:0,emoji:'💧',active:1,category_id:'water-20l',category_name:'Water Can',category_slug:'water-can',stock_status:'in_stock'}
  ];
  await page.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url()),method=request.method();
    apiRouteCalls.push({path:url.pathname,method});
    const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if(url.pathname==='/api/addresses'&&method==='GET'){
      addressRequests.push(Date.now());
      await new Promise(resolve=>setTimeout(resolve,100));
      return send({addresses:[{
      id:1,label:'Home',recipientName:'Test Customer',deliveryPhone:'9999999999',
      houseFlat:'1-1',area:'Kukatpally',city:'Hyderabad',pincode:'500072',
      latitude:17.385044,longitude:78.486671,isDefault:true
    }]});
    }
    if(url.pathname==='/api/delivery/store'&&method==='POST'){
      resolvedStoreAddresses.push(request.postDataJSON()?.address||{});
      const resolution={available:true,code:'AVAILABLE',store:{id:'store-a',name:'Store A',distanceKm:1}};
      storeResolveResponses.push(resolution);
      return send(resolution);
    }
    if(url.pathname==='/api/products'&&method==='GET'){
      storeProductQueries.push(url.search);
      return send({products});
    }
    if(url.pathname==='/api/delivery-offers'&&method==='GET')return send({settings:{
      freeDeliveryEnabled:true,freeDeliveryThreshold:800,standardDeliveryFee:30
    }});
    if(url.pathname==='/api/coupons/available'&&method==='GET')return send({coupons:[]});
    if(url.pathname==='/api/checkout/quote'&&method==='POST'){
      const payload=request.postDataJSON()||{};quoteStoreIds.push(payload.storeId||null);
      const item=products.find(product=>product.id===payload.items?.[0]?.id)||products[0];
      const qty=Number(payload.items?.[0]?.qty||1),subtotal=item.price*qty,deliveryFee=30;
      return send({pricing:{
        storeId:payload.storeId||null,itemsSubtotal:subtotal,deliveryFee,couponDiscount:0,
        finalTotal:subtotal+deliveryFee,qualifiesForFreeDelivery:false,coupon:null,
        items:[{id:item.id,name:item.name,unit:item.unit,qty,price:item.price,lineTotal:subtotal}]
      }});
    }
    if(url.pathname==='/api/delivery/availability'&&method==='POST')return send({
      available:true,code:'AVAILABLE',message:'Good news! We deliver to your area from Store A.',
      store:{id:'store-a',name:'Store A',distanceKm:1}
    });
    if(url.pathname==='/api/orders'&&method==='GET')return send({orders:[]});
    if(url.pathname==='/api/push/public-key'&&method==='GET')return send({publicKey:null});
    if(url.pathname==='/api/auth/session'&&method==='GET')return send({customerId:'test-customer',registeredPhone:'9999999999',registeredName:'Test Customer'});
    return send({});
  });

  const pageErrors=[];
  const unexpectedDialogs=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('dialog',async dialog=>{unexpectedDialogs.push(dialog.message());await dialog.dismiss();});
  const response=await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.locator('#searchInput')).toHaveCount(0);
  await expect(page.locator('.search-wrap')).toHaveCount(0);
  await expect(page.locator('#productGrid .product-card')).toHaveCount(3,{timeout:20000});
  await expect(page.locator('#productGrid .product-card:has([data-add="water-10l"])')).toContainText('₹0');
  await expect(page.locator('#productGrid [data-add="water-20l"]')).toBeVisible();
  await expect(page.locator('#productGrid [data-add="water-10l-pair"]')).toBeVisible();
  await expect(page.locator('#productGrid [data-add="water-10l"]')).toBeDisabled();
  expect(await page.evaluate(()=>window.FreshWayCustomerStoreCatalogue?.selectedStore()?.name)).toBe('Store A');
  expect(addressRequests.length).toBeGreaterThan(0,'signed-in customer saved addresses must be loaded');
  expect(resolvedStoreAddresses.length).toBeGreaterThan(0);
  expect(resolvedStoreAddresses.every(address=>address.latitude===17.385044&&address.longitude===78.486671),
    'store lookup must wait for the saved delivery map pin');

  const add=page.locator('#productGrid [data-add="water-20l"]');
  await expect(add).toBeVisible();
  await expect(page.locator('#productGrid .product-price').first()).toContainText('₹189');
  await add.click();
  await page.locator('#viewCartBtn').click();
  await expect(page.locator('#cartItems')).toContainText('20L Drinking Water Can');
  await expect(page.locator('#cartItems')).toContainText('₹189');
  await expect.poll(()=>quoteStoreIds.some(id=>id==='store-a')).toBe(true);
  await page.evaluate(()=>localStorage.setItem('waternow-selected-store-v1','legacy-store-id'));
  const addressRequestsBeforeReload=addressRequests.length;
  const storeResolutionsBeforeReload=resolvedStoreAddresses.length;
  await page.reload();
  await expect.poll(()=>addressRequests.length,{timeout:10000}).toBeGreaterThan(addressRequestsBeforeReload);
  await expect.poll(()=>resolvedStoreAddresses.length,{timeout:10000}).toBeGreaterThan(storeResolutionsBeforeReload);
  await page.evaluate(async()=>{await window.FreshWayAddressSystem?.ready;});
  const reloadDiagnostics=await page.evaluate(()=>({
    selectedAddress:window.FreshWayAddressSystem?.getSelectedAddress?.()||null,
    selectedStore:window.FreshWayCustomerStoreCatalogue?.selectedStore?.()||null,
    catalogueNotice:document.querySelector('#fwCatalogueNotice')?.textContent||'',
    gridText:document.querySelector('#productGrid')?.textContent||'',
    cartViewActive:document.querySelector('#cartView')?.classList.contains('active-view')
  }));
  console.log('WaterNow reload diagnostics',JSON.stringify({
    reloadDiagnostics,addressRequests:addressRequests.length,
    resolvedStoreAddresses:resolvedStoreAddresses.slice(-3),
    storeResolveResponses:storeResolveResponses.slice(-3),
    storeProductQueries:storeProductQueries.slice(-5),
    apiRouteCalls:apiRouteCalls.slice(-16),pageErrors
  }));
  expect(resolvedStoreAddresses.every(address=>address.latitude===17.385044&&address.longitude===78.486671),
    'reload must never resolve a store using an empty startup address');
  await expect(page.locator('#productGrid .product-card')).toHaveCount(3,{timeout:20000});
  await expect.poll(()=>page.evaluate(()=>window.FreshWayCustomerStoreCatalogue?.selectedStore()?.name)).toBe('Store A');
  expect(unexpectedDialogs).toEqual([],'refreshing the same address must not prompt for a store change');
  // The customer view-state module restores Cart after reload. Avoid clicking
  // the floating cart button when the Cart screen is already active.
  const cartAlreadyRestored=await page.locator('#cartView').evaluate(element=>element.classList.contains('active-view'));
  if(!cartAlreadyRestored)await page.locator('#viewCartBtn').click();
  await expect(page.locator('#cartView')).toHaveClass(/active-view/);
  await expect(page.locator('#cartItems')).toContainText('20L Drinking Water Can');
  await expect(page.locator('#cartItems')).toContainText('₹189');
  expect(pageErrors).toEqual([]);
});


test('guest delivery address and store survive a reload so restored cart quotes the Boduppal store', async ({ page }) => {
  const guestAddress = {
    id: null,
    label: 'Home',
    recipientName: 'WaterNow QA Test',
    deliveryPhone: '9000000001',
    houseFlat: 'QA Test 1',
    building: '',
    floor: '',
    street: '',
    area: 'Srinivasa Nagar Colony',
    locality: '',
    city: 'Boduppal',
    district: 'Medchal–Malkajgiri',
    state: 'Telangana',
    pincode: '500092',
    landmark: '',
    note: '',
    latitude: 17.415,
    longitude: 78.585,
    accuracyMeters: null,
    locationSource: 'Search',
    placeId: 'waternow-qa-boduppal',
    locationUpdatedAt: '2026-11-10T10:00:00.000Z',
    isDefault: false
  };
  const products = [
    { id: 'water-20l', name: '20L Drinking Water Can', unit: 'can', price: 30, emoji: '💧', active: 1, category_id: 'water-20l', category_name: '20L Water Can', category_slug: '20l-water-can', stock_status: 'in_stock' },
    { id: 'p-mw99d1uv-vx6mg', name: '10L Drinking Water Can', unit: 'can', price: 20, emoji: '🚰', active: 1, category_id: 'water-10l', category_name: '10L Water Can', category_slug: '10l-water-can', stock_status: 'in_stock' }
  ];
  const quotePayloads = [];
  const resolvedAddresses = [];
  const storeProductQueries = [];
  const pageErrors = [];

  await page.addInitScript(address => {
    sessionStorage.setItem('waternow-guest-address-session-v1', JSON.stringify({
      version: 1,
      expiresAt: Date.now() + 60 * 60 * 1000,
      address
    }));
  }, guestAddress);

  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const send = (data, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(data)
    });

    if (url.pathname === '/api/auth/session' && method === 'GET') return send({});
    if (url.pathname === '/api/addresses' && method === 'GET') return send({ error: 'Sign in required.' }, 401);

    if (url.pathname === '/api/delivery/store' && method === 'POST') {
      const address = request.postDataJSON()?.address || {};
      resolvedAddresses.push(address);
      if (Number(address.latitude) !== guestAddress.latitude || Number(address.longitude) !== guestAddress.longitude) {
        return send({ available: false, code: 'LOCATION_REQUIRED', message: 'Confirm your delivery pin.' });
      }
      return send({
        available: true,
        code: 'AVAILABLE',
        store: { id: 'waternow-boduppal', name: 'WaterNow Boduppal', distanceKm: 0 }
      });
    }

    if (url.pathname === '/api/products' && method === 'GET') {
      storeProductQueries.push(url.searchParams.get('storeId') || '');
      return send({ products });
    }

    if (url.pathname === '/api/checkout/quote' && method === 'POST') {
      const payload = request.postDataJSON() || {};
      quotePayloads.push(payload);
      if (payload.storeId !== 'waternow-boduppal') {
        return send({ error: 'Not enough stock for 10L Drinking Water Can. Please reduce the quantity and try again.' }, 400);
      }
      const lines = (payload.items || []).map(item => {
        const product = products.find(candidate => candidate.id === item.id);
        return { id: product.id, name: product.name, unit: product.unit, qty: item.qty, price: product.price, lineTotal: product.price * item.qty };
      });
      const subtotal = lines.reduce((sum, item) => sum + item.lineTotal, 0);
      return send({ pricing: {
        storeId: payload.storeId,
        items: lines,
        itemsSubtotal: subtotal,
        freeDeliveryEnabled: true,
        freeDeliveryThreshold: 800,
        qualifiesForFreeDelivery: subtotal >= 800,
        amountToFreeDelivery: Math.max(0, 800 - subtotal),
        standardDeliveryFee: 30,
        deliveryFee: subtotal >= 800 ? 0 : 30,
        couponDiscount: 0,
        finalTotal: subtotal + (subtotal >= 800 ? 0 : 30),
        couponCode: null,
        coupon: null
      } });
    }

    if (url.pathname === '/api/coupons/available' && method === 'GET') return send({ coupons: [] });
    if (url.pathname === '/api/delivery/availability' && method === 'POST') return send({
      available: true,
      code: 'AVAILABLE',
      message: 'Good news! We deliver to your area from WaterNow Boduppal.',
      store: { id: 'waternow-boduppal', name: 'WaterNow Boduppal', distanceKm: 0 }
    });
    if (url.pathname === '/api/push/public-key' && method === 'GET') return send({ publicKey: null });
    return send({});
  });

  page.on('pageerror', error => pageErrors.push(error.message));
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);

  await page.evaluate(async () => {
    await window.FreshWayAddressSystem?.ready;
    await window.FreshWayCustomerStoreCatalogue?.ensureSelectedStore?.();
  });
  await expect.poll(() => page.evaluate(() => window.FreshWayCustomerStoreCatalogue?.selectedStore()?.id || '')).toBe('waternow-boduppal');
  await expect(page.locator('#homeAddress')).toContainText('Srinivasa Nagar Colony');
  await expect(page.locator('#productGrid .product-card')).toHaveCount(2);

  for (const id of ['water-20l', 'p-mw99d1uv-vx6mg']) {
    await page.locator('#productGrid [data-add="' + id + '"]').click();
    for (let i = 0; i < 4; i++) await page.locator('#productGrid [data-plus="' + id + '"]').click();
  }
  expect(await page.evaluate(() => window.state.cart)).toEqual({
    'water-20l': 5,
    'p-mw99d1uv-vx6mg': 5
  });

  await page.evaluate(() => window.setView('cart'));
  await expect(page.locator('#cartItems')).toContainText('5 × can');
  await expect(page.locator('#cartItems')).toContainText('₹150');
  await expect(page.locator('#cartItems')).toContainText('₹100');
  await expect.poll(() => quotePayloads.length).toBeGreaterThan(0);
  expect(quotePayloads.every(payload => payload.storeId === 'waternow-boduppal'),
    'every cart quote must use the resolved Boduppal store, never central stock');
  await expect(page.locator('#cartSummary')).toContainText('₹250');
  await expect(page.locator('#cartSummary')).toContainText('₹280');
  await expect(page.locator('#cartSummary')).not.toContainText('Not enough stock');

  const quotesBeforeReload = quotePayloads.length;
  await page.reload();
  await page.evaluate(async () => {
    await window.FreshWayAddressSystem?.ready;
    await window.FreshWayCustomerStoreCatalogue?.ensureSelectedStore?.();
  });
  await expect.poll(() => page.evaluate(() => window.FreshWayAddressSystem?.getSelectedAddress?.()?.city || '')).toBe('Boduppal');
  await expect.poll(() => page.evaluate(() => window.FreshWayCustomerStoreCatalogue?.selectedStore()?.id || '')).toBe('waternow-boduppal');

  await page.evaluate(() => window.setView('cart'));
  await expect(page.locator('#cartItems')).toContainText('20L Drinking Water Can');
  await expect(page.locator('#cartItems')).toContainText('10L Drinking Water Can');
  await expect(page.locator('#cartItems')).toContainText('5 × can');
  await expect.poll(() => quotePayloads.length).toBeGreaterThan(quotesBeforeReload);
  expect(quotePayloads.slice(quotesBeforeReload).every(payload => payload.storeId === 'waternow-boduppal'),
    'after reload the restored cart must quote against the restored Boduppal store');
  await expect(page.locator('#cartSummary')).toContainText('₹250');
  await expect(page.locator('#cartSummary')).toContainText('₹280');
  await expect(page.locator('#cartSummary')).not.toContainText('Not enough stock');
  expect(resolvedAddresses.length).toBeGreaterThan(0);
  expect(resolvedAddresses.every(address => Number(address.latitude) === guestAddress.latitude && Number(address.longitude) === guestAddress.longitude));
  expect(storeProductQueries).toContain('waternow-boduppal');
  expect(pageErrors).toEqual([]);
});
