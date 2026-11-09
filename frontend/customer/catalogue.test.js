const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('frontend/customer/catalogue.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const freshness=fs.readFileSync('frontend/customer/state-freshness.js','utf8');
const ordersData=fs.readFileSync('frontend/customer/orders-data.js','utf8');

// Cart IDs become strings when saved in localStorage. Keep matching stable when
// catalogue IDs arrive as numbers, and retain the item snapshot if catalogue fetch fails.
const cartBoundary=fs.readFileSync('frontend/customer/catalogue-cart.js','utf8');
const cartContext={window:{}};
vm.createContext(cartContext);
vm.runInContext(cartBoundary,cartContext);
const savedCart={cart:{'42':1},cartProducts:{'42':{id:'42',name:'Groundnut oil/5ltrs',unit:'kg',price:1850,emoji:'🛢️',unavailable:false}}};
const numericProduct={id:42,name:'Groundnut oil/5ltrs',unit:'kg',price:1850,emoji:'🛢️'};
assert.equal(cartContext.window.FreshWayCatalogueCart.items(savedCart,[numericProduct])[0].product.id,42,'numeric catalogue IDs must match string keys from localStorage');
assert.equal(cartContext.window.FreshWayCatalogueCart.total(savedCart,[numericProduct]),1850,'the saved item total must remain ₹1,850 after the catalogue refresh');
const offlineCart=cartContext.window.FreshWayCatalogueCart.items(savedCart,[]);
assert.equal(offlineCart.length,1,'a temporary empty catalogue must not hide a saved cart line');
assert.equal(offlineCart[0].product.name,'Groundnut oil/5ltrs');
assert.equal(cartContext.window.FreshWayCatalogueCart.total(savedCart,[]),1850,'a saved cart snapshot preserves the line while catalogue data is unavailable');
const legacyCart=cartContext.window.FreshWayCatalogueCart.items({cart:{'old-id':1}},[]);
assert.equal(legacyCart.length,1,'older carts without snapshots must still retain their item quantity and ID');
assert.equal(legacyCart[0].product.id,'old-id');
assert.match(fs.readFileSync('frontend/customer/cart-persistence.js','utf8'),/const clearCatalogue=\(\)=>\{[\s\S]*Empty\/failed catalogue response is not a customer cart-delete action/);


assert.match(source,/window\.FreshWayCustomerAPI\?\.request/);
assert.match(source,/request\('\/api\/products\?storeId='/,'customer catalogue loads the selected store products directly');
assert.doesNotMatch(source,/request\('\/api\/categories\?storeId='/,'customer home no longer makes a separate category request');
assert.doesNotMatch(source,/fetch\(['"]\/api\/(categories|products)/);
assert.match(source,/window\.FreshWayCustomerCatalogue\?\.setProducts/);
assert.match(source,/loadToken/);
assert.match(source,/hadData/);
assert.match(source,/freshWayCustomerCatalogueRefresh/);
assert.doesNotMatch(source,/productOk\)window\.FreshWayCustomerCatalogue\?\.clear/);
assert.match(source,/window\.FreshWayCustomerCatalogue\?\.clear/);
assert.match(source,/role="status"/);
assert.match(source,/fwCatalogueRetry/);
assert.match(source,/errorCode==='AREA_UNAVAILABLE'/,'a real out-of-area Worker response must have a dedicated customer home state');
assert.match(source,/nearby RTC bus stand/,'out-of-area customers must see the possible nearby handover option');
assert.match(source,/postal delivery options/,'out-of-area customers must see the possible postal delivery option');
assert.match(source,/data-fw-delivery-contact/,'out-of-area customers must have a working contact action');
assert.match(source,/window\.setView\?\.\('contact'\)/,'the home-screen delivery contact action must navigate to Contact Us');
assert.ok(!source.includes('class="fw-category-card"'),'category cards are intentionally absent from the WaterNow customer home');
assert.doesNotMatch(source,/data:'\+x\.image_mime_type/,'the public category list must not inline image payloads');
assert.doesNotMatch(app,/FALLBACK_PRODUCTS/);
assert.match(app,/window\.FreshWayCustomerCatalogue/);
assert.match(app,/FreshWayCustomerStateFreshness/);
assert.match(app,/freshway:session-expired/);
assert.match(app,/freshway:catalogue-sync/);
assert.match(freshness,/pageshow/);
assert.match(freshness,/visibilitychange/);
assert.match(freshness,/cart/);
assert.match(freshness,/checkout/);
assert.match(ordersData,/customerId\(\)!==result\.id/);
assert.match(ordersData,/state\.orders=\[\]/);
assert.match(app,/customerOrderData\.load\(\)/);
assert.match(app,/customerOrderData\.stop\(\)/);

const serviceWorker=fs.readFileSync('sw.js','utf8');
assert.match(serviceWorker,/const CACHE = 'waternow-customer-v2'/);
assert.match(serviceWorker,/const REQUIRED_SHELL\s*=\s*\[\s*'\/'\s*,\s*'\/index\.html'\s*\]/);
assert.doesNotMatch(serviceWorker,/index\.html\?v=20261007-seo-v1/);
console.log('PWA service worker install contract OK');

console.log('catalogue server-authority/error-boundary OK');

const cartView=fs.readFileSync('frontend/customer/cart-view.js','utf8');
assert.match(cartView,/image_data&&x\.product\.image_mime_type/);
assert.match(cartView,/cart-product-media/);
const productView=fs.readFileSync('frontend/customer/product-view.js','utf8');
const productGrid={innerHTML:''};
const productCount={textContent:''};
const productViewContext={
  window:{WaterNowCatalogueMedia:{image:()=>''}},
  document:{querySelector(selector){
    if(selector==='#productGrid')return productGrid;
    if(selector==='.count-pill')return productCount;
    return null;
  }}
};
vm.createContext(productViewContext);
vm.runInContext(productView,productViewContext);
productViewContext.window.WaterNowCustomerProductView.render(
  [{id:'custom-product',name:'Configured product name',unit:'custom selling unit',price:0,active:1,stock_status:'in_stock'}],
  {cart:{}},
  '',
  {esc:value=>String(value??''),money:value=>'₹'+Number(value||0),changeQty(){},updateCartBar(){}}
);
assert.ok(productGrid.innerHTML.includes('<h3>Configured product name</h3>'),'the saved catalogue name must be displayed verbatim');
assert.match(productGrid.innerHTML,/class="product-price">₹0<small> \/ custom selling unit<\/small>/,'zero price and configured unit must be displayed');
assert.match(productGrid.innerHTML,/data-add="custom-product"[^>]*disabled/,'a zero price is displayed but not orderable until a selling price is set');
assert.equal(productCount.textContent,'1 item');

assert.match(productView,/stock_status/);
assert.match(productView,/OUT OF STOCK/);
assert.match(productView,/data-plus/);
assert.match(productView,/stock-cart-warning/);

const media=fs.readFileSync('frontend/catalogue-media.js','utf8');
assert.doesNotMatch(media,/water-20l|water-10l-pair|groundnut|sunflower|rice/i,'image selection must not depend on a fixed product ID or name');
const mediaContext={window:{}};
vm.createContext(mediaContext);
vm.runInContext(media,mediaContext);
const configuredImage='/api/catalogue/images/products/custom-product?v=abc';
assert.equal(mediaContext.window.WaterNowCatalogueMedia.image('products','custom-product',{image_url:configuredImage}),configuredImage,'the catalogue-saved image URL must be used for any product ID');
assert.equal(mediaContext.window.WaterNowCatalogueMedia.image('products','custom-product',{image_data:'YWJj',image_mime_type:'image/webp'}),'data:image/webp;base64,YWJj','legacy uploaded image data remains supported');
assert.equal(mediaContext.window.WaterNowCatalogueMedia.image('products','custom-product',{}),'','missing image configuration must not be replaced by a guessed product icon');
assert.match(productView,/WaterNowCatalogueMedia/);
assert.match(productView,/image_data&&p\.image_mime_type/);
assert.match(cartView,/WaterNowCatalogueMedia/,'cart uses the configurable WaterNow image source');
assert.doesNotMatch(cartView,/FreshWayCatalogueMedia/,'cart does not use a FreshWay product map');
assert.match(cartView,/cart-product-media-empty/,'products without a configured image use a neutral placeholder');
assert.doesNotMatch(productView,/FreshWayCatalogueMedia/);
const styles=fs.readFileSync('styles.css','utf8');
const categoryFoldStyles=fs.readFileSync('frontend/customer/category-fold-fit.css','utf8');
assert.match(styles,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
assert.match(styles,/\.product-image img\{[^}]*object-fit:contain/);
assert.match(styles,/\.product-card\{min-width:0;overflow:hidden\}/);
assert.match(styles,/\.fw-category-icon\{width:54px;height:54px/);
assert.match(styles,/\.fw-category-back\{min-height:54px/);
assert.match(styles,/\.product-image\{height:132px/);
assert.match(styles,/\.product-actions \.qty-control\{flex:0 0 auto;min-width:98px\}/);
assert.match(styles,/\.qty-control button\{border:0;background:#f5f8f6;width:34px;min-width:34px;height:38px\}/);
assert.match(styles,/@media\(max-width:380px\)/);
const ownerCatalogue=fs.readFileSync('frontend/admin/catalogue.js','utf8');
assert.match(ownerCatalogue,/id="fwPUnit" required maxlength="30"/,'product unit must be configurable as free text');
assert.doesNotMatch(ownerCatalogue,/\['kg','g','litre','ml','piece','packet','box','bottle','dozen'\]/,'catalogue must not hardcode a product-unit whitelist');
assert.doesNotMatch(fs.readFileSync('worker/src/catalogue-api.js','utf8'),/const units=new Set/,'Worker API must accept configurable product units');
assert.match(ownerCatalogue,/type="file"/);
assert.match(ownerCatalogue,/compressProductImage/);
assert.match(ownerCatalogue,/imageData:image\.data/);
assert.match(ownerCatalogue,/fwCatImage/);
assert.match(ownerCatalogue,/fwRemoveCatImage/);
assert.match(ownerCatalogue,/Category image/);
const migration=fs.readFileSync('worker/migrations/0015_product_images.sql','utf8');
const categoryMigration=fs.readFileSync('worker/migrations/0016_category_images.sql','utf8');
assert.match(migration,/ALTER TABLE products ADD COLUMN image_data TEXT/);
assert.match(migration,/ALTER TABLE products ADD COLUMN image_mime_type TEXT/);
assert.match(categoryMigration,/ALTER TABLE categories ADD COLUMN image_data TEXT/);
assert.match(categoryMigration,/ALTER TABLE categories ADD COLUMN image_mime_type TEXT/);
const catalogueApi=fs.readFileSync('worker/src/catalogue-api.js','utf8');
assert.match(catalogueApi,/MAX_IMAGE_DATA/);
assert.match(catalogueApi,/image_data/);
assert.match(catalogueApi,/imageFields\(p,'Category'\)/);
assert.match(catalogueApi,/async function publicCatalogueImage/);
assert.match(catalogueApi,/image_url/);
assert.match(catalogueApi,/cache-control/);
console.log('catalogue UI-only media mapping OK');

const navigation=fs.readFileSync('frontend/customer/navigation.js','utf8');
assert.match(navigation,/__waterNowCustomer/);

const ownerLifecycle=fs.readFileSync('owner-lifecycle.js','utf8');
const adminSource=fs.readFileSync('admin.js','utf8');
assert.match(ownerLifecycle,/refreshOwnerAfterOrderMutation/);
assert.match(ownerLifecycle,/await refreshOwnerAfterOrderMutation\(\)/);
assert.match(adminSource,/async function refreshOwnerAfterOrderMutation/);
assert.match(adminSource,/if\(id==='overview'\)await Promise\.all\(\[loadSummary\(\),loadBusiness\(\),loadHome\(\)\]\)/);
assert.match(adminSource,/else if\(id==='orders'\)await Promise\.all\(\[loadSummary\(\),loadBusiness\(\),loadOrders\(true\)\]\)/);



assert.ok(!source.includes('class="fw-category-card"'),'category tiles are not shown on the customer home');
assert.ok(!source.includes("const WATER_PRODUCT_IDS=new Set(['water-20l','water-10l-pair'])"),'customer display is driven by the selected store catalogue, not a fixed product-ID whitelist');
assert.ok(source.includes('const nextProducts=productResult.products;'),'all products returned by the selected store catalogue are displayed');
assert.ok(source.includes('Available water products'),'the customer home displays its product heading directly');
assert.ok(source.includes("c.hidden=!notice"),'the extra category area collapses when it has no delivery message');
assert.ok(!source.includes('data-fw-category'),'there are no category-selection controls in the WaterNow home');
assert.ok(source.includes('window.waterNowCustomerCatalogueGoHome=()=>setMode(null'),'Home navigation restores the catalogue product list');



console.log('premium category selection, navigation and customer-facing product naming contracts OK');

assert.ok(!source.includes("classList.toggle('fw-category-selected'"),'the category-only compact layout is disabled');
assert.match(categoryFoldStyles,/\.product-image img\{[^}]*width:auto!important;height:100%!important;aspect-ratio:1\/1[^}]*max-width:100%!important;max-height:100%!important;object-fit:contain!important;object-position:center!important/,'water pack images remain contained without distortion');
console.log('catalogue-driven customer home contract OK');


// Repeated catalogue refreshes with unchanged cart contents must not rebuild the
// pricing/coupon DOM or re-trigger quote/coupon requests.
{
  let cartItemsHTML='';
  let cartSummaryHTML='';
  let summaryWrites=0;
  const cartItemsElement={
    get innerHTML(){return cartItemsHTML},
    set innerHTML(value){cartItemsHTML=String(value)},
    querySelector(selector){
      if(selector==='.empty')return cartItemsHTML.includes('class="empty"')?{}:null;
      if(selector==='[data-fw-cart-product]')return cartItemsHTML.includes('data-fw-cart-product=')?{}:null;
      return null;
    }
  };
  const cartSummaryElement={
    get innerHTML(){return cartSummaryHTML},
    set innerHTML(value){summaryWrites++;cartSummaryHTML=String(value)},
    querySelector(selector){
      const marker={'#fwDeliveryPricing':'id="fwDeliveryPricing"','#fwAvailableCoupons':'id="fwAvailableCoupons"'}[selector];
      return marker&&cartSummaryHTML.includes(marker)?{}:null;
    }
  };
  const testDocument={querySelector(selector){
    if(selector==='#cartItems')return cartItemsElement;
    if(selector==='#cartSummary')return cartSummaryElement;
    return null;
  }};
  let pricingRenders=0;
  const testContext={document:testDocument,window:{FreshWayCustomerDeliveryOffers:{renderCart(){pricingRenders++}}}};
  vm.createContext(testContext);
  vm.runInContext(cartView,testContext);
  const view=testContext.window.FreshWayCustomerCartView;
  const renderOptions={esc:value=>String(value??''),money:value=>'₹'+value,setView(){}};
  const product={id:'p1',name:'Groundnut oil',unit:'kg',price:1850,emoji:'🫙',image_mime_type:'image/png',image_data:'image-data-v1'};
  view.render([{product,qty:1}],1850,renderOptions);
  const writesAfterInitialRender=summaryWrites;
  assert.equal(pricingRenders,1);
  view.render([{product:{...product},qty:1}],1850,renderOptions);
  assert.equal(summaryWrites,writesAfterInitialRender,'an unchanged catalogue refresh must preserve the existing pricing/coupon UI');
  assert.equal(pricingRenders,1,'an unchanged catalogue refresh must not restart pricing and coupon requests');
  view.render([{product:{...product,price:1900},qty:1}],1900,renderOptions);
  assert.equal(summaryWrites,writesAfterInitialRender+1,'a real product price change must rerender the cart');
  assert.equal(pricingRenders,2,'a real product price change must refresh the quote');
  cartSummaryElement.innerHTML='';
  const writesAfterExternalClear=summaryWrites;
  view.render([{product:{...product,price:1900},qty:1}],1900,renderOptions);
  assert.equal(summaryWrites,writesAfterExternalClear+1,'missing pricing DOM must be rebuilt even when cart contents are unchanged');
}
console.log('customer cart stable-render regression OK');
