import { test, expect } from '@playwright/test';

test('WaterNow storefront resolves a local supplier and displays its water-pack prices',async({page})=>{
  const quoteStoreIds=[];
  const addressRequests=[];
  const resolvedStoreAddresses=[];
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
      return send({available:true,code:'AVAILABLE',store:{id:'store-a',name:'Store A',distanceKm:1}});
    }
    if(url.pathname==='/api/products'&&method==='GET')return send({products});
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
    resolvedStoreAddresses:resolvedStoreAddresses.slice(-3),apiRouteCalls:apiRouteCalls.slice(-12),
    pageErrors
  }));
  expect(resolvedStoreAddresses.every(address=>address.latitude===17.385044&&address.longitude===78.486671),
    'reload must never resolve a store using an empty startup address');
  await expect(page.locator('#productGrid .product-card')).toHaveCount(3,{timeout:20000});
  await expect.poll(()=>page.evaluate(()=>window.FreshWayCustomerStoreCatalogue?.selectedStore()?.name)).toBe('Store A');
  expect(unexpectedDialogs).toEqual([],'refreshing the same address must not prompt for a store change');
  await page.locator('#viewCartBtn').click();
  await expect(page.locator('#cartItems')).toContainText('20L Drinking Water Can');
  await expect(page.locator('#cartItems')).toContainText('₹189');
  expect(pageErrors).toEqual([]);
});
