import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const products = [
  { id:'water-20l',name:'20L Drinking Water Can',unit:'can',price:120,active:1,category_id:'water-20l',category_name:'20L Water Can',category_slug:'20l-water-can' },
  { id:'water-10l-pair',name:'2 × 10L Drinking Water Cans',unit:'pack',price:90,active:1,category_id:'water-10l-pair',category_name:'2 × 10L Water Cans',category_slug:'two-10l-water-cans' }
];
const categories = [
  { id:'water-20l',name:'20L Water Can',slug:'20l-water-can',icon:'💧',description:'Reusable 20-litre drinking water can',product_count:1,display_order:1 },
  { id:'water-10l-pair',name:'2 × 10L Water Cans',slug:'two-10l-water-cans',icon:'🚰',description:'Two 10-litre drinking water cans',product_count:1,display_order:2 }
];
const promoFixtureFiles = ['fixtures/promotion-visual-fixture-1.png','fixtures/promotion-visual-fixture-2.png'];
const promotionImages = promoFixtureFiles.map(file=>readFileSync(resolve(process.cwd(),file)));
const promotions = [
  {id:'visual-promo-1',alt_text:'WaterNow home delivery promotion fixture',image_url:'/api/promotions/images/visual-promo-1?v=fixture-1',display_order:1,active:1},
  {id:'visual-promo-2',alt_text:'WaterNow water-pack promotion fixture',image_url:'/api/promotions/images/visual-promo-2?v=fixture-2',display_order:2,active:1}
];

test('WaterNow catalogue artwork and promotion images load and decode on mobile and desktop',async({page})=>{
  await mkdir('test-results/visual-review',{recursive:true});
  await page.addInitScript(()=>{localStorage.clear();sessionStorage.clear();});
  await page.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url()),method=request.method();
    if(method==='POST'&&url.pathname==='/api/delivery/store')return route.fulfill({
      status:200,contentType:'application/json',
      body:JSON.stringify({available:true,code:'AVAILABLE',store:{id:'store-visual',name:'WaterNow Visual Supplier',distanceKm:1}})
    });
    if(method==='GET'&&url.pathname==='/api/products')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({products})});
    if(method==='GET'&&url.pathname==='/api/promotions')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({promotions})});
    const promotionImage=url.pathname.match(/^\/api\/promotions\/images\/(visual-promo-[12])$/);
    if(method==='GET'&&promotionImage){
      const index=promotionImage[1]==='visual-promo-1'?0:1;
      return route.fulfill({status:200,contentType:'image/png',headers:{'cache-control':'public,max-age=31536000,immutable',etag:'"visual-fixture-'+(index+1)+'"','x-content-type-options':'nosniff'},body:promotionImages[index]});
    }
    if(method==='GET'&&url.pathname==='/api/auth/session')return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({authenticated:false})});
    if(method==='GET'&&url.pathname==='/api/orders')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({orders:[]})});
    if(method==='GET'&&url.pathname==='/api/addresses')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({addresses:[]})});
    if(method==='GET'&&url.pathname==='/api/push/public-key')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({publicKey:null})});
    return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:'Endpoint not configured in WaterNow visual fixture.'})});
  });

  const decoded=async locator=>{
    await expect.poll(()=>locator.evaluateAll(images=>images.length>0&&images.every(image=>image.complete&&image.naturalWidth>0&&image.naturalHeight>0))).toBe(true);
  };
  const capture=async name=>page.screenshot({path:'test-results/visual-review/'+name+'.png',fullPage:false,animations:'disabled'});

  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const semanticMedia=await page.evaluate(()=>({
    twentyLCategory:window.WaterNowCatalogueMedia.image('categories','renamed-category',{name:'20L Water Can',slug:'20l-water-can'}),
    twinPackCategory:window.WaterNowCatalogueMedia.image('categories','renamed-twin-pack',{name:'2 × 10L Water Cans',slug:'two-10l-water-cans'}),
    twentyLProduct:window.WaterNowCatalogueMedia.image('products','renamed-20l-product',{name:'20L Drinking Water Can'}),
    twinPackProduct:window.WaterNowCatalogueMedia.image('products','renamed-10l-product',{name:'2 × 10L Drinking Water Cans'}),
    directTwentyL:window.WaterNowCatalogueMedia.image('products','water-20l',{name:'Unknown name'}),
    unknownProduct:window.WaterNowCatalogueMedia.image('products','unmapped-product',{name:'Unmapped Product'})
  }));
  expect(semanticMedia).toEqual({
    twentyLCategory :'frontend/media/catalogue/water-20l.svg',
    twinPackCategory :'frontend/media/catalogue/water-10l-pair.svg',
    twentyLProduct :'frontend/media/catalogue/water-20l.svg',
    twinPackProduct :'frontend/media/catalogue/water-10l-pair.svg',
    directTwentyL :'frontend/media/catalogue/water-20l.svg',
    unknownProduct:''
  });

  const promotionSlides=page.locator('.hero-banner .fw-promo-slide img');
  await expect.poll(()=>promotionSlides.count()).toBe(2);
  const activePromotion=page.locator('.hero-banner .fw-promo-slide[aria-hidden="false"] img');
  await decoded(activePromotion);
  await expect(promotionSlides.nth(1)).not.toHaveAttribute('src',/.+/);
  await page.locator('[data-fw-promo-dot="1"]').click();
  await decoded(activePromotion);

  await expect(page.locator('#productGrid .product-card')).toHaveCount(2);
  await expect(page.locator('#productGrid .product-card').filter({hasText:'20L Drinking Water Can'})).toBeVisible();
  await expect(page.locator('#productGrid .product-card').filter({hasText:'2 × 10L Drinking Water Cans'})).toBeVisible();
  const mobileProductImages=page.locator('#productGrid .product-card .product-image img');
  await expect(mobileProductImages).toHaveCount(2);
  await decoded(mobileProductImages);
  await page.evaluate(()=>window.scrollTo(0,0));
  await capture('mobile-water-pack-home');

  const mobileTwentyLCard=page.locator('#productGrid .product-card').filter({hasText:'20L Drinking Water Can'});
  await mobileTwentyLCard.scrollIntoViewIfNeeded();
  await decoded(mobileTwentyLCard.locator('.product-image img'));
  await capture('mobile-20l-pack');

  await page.setViewportSize({width:1365,height:900});
  await page.reload();
  const desktopPromotion=page.locator('.hero-banner .fw-promo-slide[aria-hidden="false"] img');
  await decoded(desktopPromotion);
  await expect(page.locator('#productGrid .product-card')).toHaveCount(2);
  await decoded(page.locator('#productGrid .product-card .product-image img'));
  await page.evaluate(()=>window.scrollTo(0,0));
  await capture('desktop-water-pack-home');

  const desktopTwinPackCard=page.locator('#productGrid .product-card').filter({hasText:'2 × 10L Drinking Water Cans'});
  await desktopTwinPackCard.scrollIntoViewIfNeeded();
  await decoded(desktopTwinPackCard.locator('.product-image img'));
  await capture('desktop-twin-10l-pack');
});
