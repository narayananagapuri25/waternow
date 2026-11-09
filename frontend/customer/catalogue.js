(function(){
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const STORE_STORAGE_KEY='waternow-selected-store-v1';
  const readStoreId=()=>{try{return window.localStorage.getItem(STORE_STORAGE_KEY)||''}catch(_){return''}};
  let selectedStoreIdValue=readStoreId(),selectedStore=null,pendingStore=null;
  let categories=[],products=[],selected=null,ready=false,loading=true,errorMessage='',errorCode='',loadToken=0;
  const media=window.WaterNowCatalogueMedia;
  const style=document.createElement('style');
  style.textContent='.fw-home-catalogue{margin-top:2px}.fw-cat-heading{display:flex;justify-content:space-between;align-items:end;margin:0 0 12px}.fw-cat-heading h2{margin:3px 0 0;font-size:22px}.fw-category-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.fw-category-card{border:1px solid var(--line);background:#fff;border-radius:16px;padding:12px;box-shadow:var(--shadow);text-align:left;cursor:pointer;height:128px;min-height:128px;display:flex;flex-direction:column;justify-content:space-between}.fw-category-card:active{transform:scale(.99)}.fw-category-icon{width:54px;height:54px;border-radius:15px;background:var(--mint);display:grid;place-items:center;font-size:29px}.fw-category-card strong{font-size:14px;margin-top:8px}.fw-category-card small{display:block;color:var(--muted);font-size:10px;margin-top:3px}.fw-category-card .fw-cat-arrow{color:var(--green);font-weight:900;float:right}.fw-category-empty,.fw-category-loading,.fw-category-error{background:#fff;border:1px solid var(--line);border-radius:18px;padding:28px 20px;text-align:center;color:var(--muted);font-size:11px;line-height:1.5}.fw-category-empty{border-style:dashed}.fw-category-loading::before{content:"↻";display:block;font-size:26px;color:var(--green);margin-bottom:6px}.fw-category-error{border-color:#f0d5d5}.fw-category-error strong{display:block;color:var(--ink);margin-bottom:5px}.fw-catalogue-retry{margin-top:14px;border:0;background:var(--green);color:#fff;border-radius:11px;padding:10px 16px;font-size:11px;font-weight:900}.fw-category-back{display:flex;align-items:center;gap:8px;margin:0 0 12px}.fw-category-back button{border:1px solid var(--line);background:#fff;width:38px;height:38px;border-radius:12px;font-size:22px}.fw-category-back strong{font-size:18px}.fw-category-back small{display:block;color:var(--muted);font-size:9px;margin-top:2px}.fw-category-home-hidden{display:none!important}@media(max-width:380px){.fw-category-grid{gap:8px}.fw-category-card{height:108px;padding:8px;min-height:108px}}';
  style.textContent += '.fw-category-image img{width:100%;height:100%;object-fit:contain;border-radius:inherit}.fw-category-image{overflow:hidden}.fw-selected-category-image{background:linear-gradient(90deg,rgba(15,122,75,.06),rgba(15,122,75,.02))}.fw-category-card[aria-pressed=true]{border-color:#0b91ad;background:#f0fbfd;box-shadow:0 4px 16px rgba(8,125,168,.12)}.fw-category-card[aria-pressed=true] .fw-category-icon{background:#d9f5fa}.fw-location-needed{margin:12px 0 0;padding:12px 14px;border-radius:14px;background:#f0fbfd;color:#315966;font-size:12px;line-height:1.5}.fw-location-needed button{display:block;margin-top:8px;border:0;border-radius:10px;background:#075b78;color:#fff;padding:9px 13px;font-weight:800}';
  style.textContent += '.fw-area-unavailable{background:#fff;border:1px solid #dce9df;border-radius:18px;padding:22px;text-align:left;box-shadow:var(--shadow);color:var(--ink)}.fw-area-unavailable .eyebrow{display:block;color:var(--green);margin-bottom:8px}.fw-area-unavailable h2{margin:0 0 8px;font-size:20px;line-height:1.25;letter-spacing:-.02em}.fw-area-unavailable p{margin:0 0 16px;color:var(--muted);font-size:13px;line-height:1.55}';
  style.textContent += ".fw-category-back{display:flex;align-items:center;justify-content:flex-start;gap:8px;margin:0 0 10px;padding:0;background:transparent;border:0;box-shadow:none;min-height:0}\n.fw-category-back button{display:inline-flex;align-items:center;justify-content:center;gap:7px;width:auto;min-height:36px;flex:0 0 auto;padding:0 13px;border:1px solid #dce8df;border-radius:999px;background:#fff;color:var(--green);font-size:12px;font-weight:800;box-shadow:0 2px 8px rgba(20,70,45,.04)}\n.fw-category-back .fw-back-arrow{font-size:20px;line-height:1;font-weight:500}\n.section-heading{margin-bottom:14px}\n.section-heading h2{font-size:23px;letter-spacing:-.025em}\n.product-grid{align-items:stretch;gap:12px}\n.product-card{display:flex;flex-direction:column;min-height:100%;padding:10px;border-radius:20px;border:1px solid #e8eee9;box-shadow:0 5px 18px rgba(20,70,45,.045);background:#fff}\n.product-image{position:relative;height:auto;aspect-ratio:1/1;max-height:190px;min-height:114px;padding:8px;margin-bottom:12px;border:1px solid #f0eee5;border-radius:16px;background:linear-gradient(160deg,#fffdf8 0%,#f7f8f3 100%);overflow:hidden}\n.product-image img{width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;object-position:center;display:block;transition:transform .2s ease}\n.product-card h3{font-size:14px;line-height:1.28;min-height:36px;margin:0 0 10px;font-weight:800;letter-spacing:-.015em;color:#17231d}\n.product-actions{margin-top:auto;padding-top:10px;border-top:1px solid #f0f3f0;gap:9px}\n.product-action-info{align-items:center;gap:6px}\n.product-price{font-size:16px;font-weight:900;letter-spacing:-.02em}\n.product-price small{font-size:10px;font-weight:700;color:var(--muted);letter-spacing:0}\n.stock-pill{font-size:9px;font-weight:800;border-radius:999px;padding:5px 7px}\n.product-action-control>.add-btn{min-height:40px;border-radius:12px;font-size:12px;letter-spacing:.02em;box-shadow:0 3px 9px rgba(15,122,75,.12)}\n.product-action-control>.qty-control{min-height:40px;border-radius:12px}\n.product-image-fallback{display:grid;place-items:center;width:100%;height:100%;min-height:100px;border-radius:10px;background:linear-gradient(145deg,#edf7f0,#f7f7ee);font-size:46px;color:var(--green)}\n.fw-category-home-hidden{display:none!important}\n@media(max-width:380px){\n .product-grid{gap:9px}\n .product-card{padding:8px;border-radius:17px}\n .product-image{padding:6px;min-height:104px;margin-bottom:10px}\n .product-card h3{font-size:13px;min-height:34px}\n .product-price{font-size:14px}\n .product-action-info .stock-pill{font-size:8px;padding:4px 6px}\n}\n@media(hover:hover){.product-card:hover{border-color:#d5e5da;box-shadow:0 10px 28px rgba(20,70,45,.075)}.product-card:hover .product-image img{transform:scale(1.025)}}";
  style.textContent += ".fw-home-catalogue{margin:6px 0 14px}.fw-cat-heading{align-items:center;margin-bottom:8px}.fw-cat-heading h2{font-size:19px;line-height:1.2;letter-spacing:-.025em}.fw-cat-heading .count-pill{white-space:nowrap;flex-shrink:0}.fw-category-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;align-items:stretch}.fw-category-card{min-width:0;width:100%;height:128px;min-height:128px;padding:12px;border-radius:16px}.fw-category-icon{width:54px;height:54px;flex:0 0 54px;border-radius:15px;font-size:27px}.fw-category-card>span:last-child{min-width:0}.fw-category-card strong{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;line-height:1.15;margin-top:4px;font-size:12px}.fw-category-card small{line-height:1.25;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fw-category-grid.is-single{grid-template-columns:minmax(0,1fr)}.fw-category-grid.is-single .fw-category-card{height:auto;min-height:90px;padding:12px 14px;flex-direction:row;align-items:center;justify-content:flex-start;gap:12px}.fw-category-grid.is-single .fw-category-icon{width:62px;height:62px;flex:0 0 62px;border-radius:14px;font-size:24px}.fw-category-grid.is-single .fw-category-card strong{display:block;margin-top:0;font-size:14px}.fw-category-grid.is-single .fw-category-card small{font-size:11px}.fw-category-grid.is-single .fw-category-card .fw-cat-arrow{float:none;white-space:nowrap}.fw-category-grid.is-single .fw-category-card>span:last-child{flex:1}@media(max-width:380px){.fw-category-grid{gap:8px}.fw-category-card{height:120px;min-height:120px;padding:10px}.fw-category-icon{width:50px;height:50px;flex-basis:50px}.fw-category-grid.is-single .fw-category-card{height:auto;min-height:80px;padding:10px 12px}.fw-category-grid.is-single .fw-category-icon{width:56px;height:56px;flex-basis:56px}}";
  document.head.appendChild(style);
  function ensureUI(){
    const home=$('#homeView');if(!home)return;
    let c=$('#fwCategoryCatalogue');
    if(!c){c=document.createElement('section');c.id='fwCategoryCatalogue';c.className='fw-home-catalogue';home.appendChild(c)}
    const back=$('#fwCategoryBack');if(back)back.remove();
    const hero=$('.hero-banner');
    if(hero&&hero.parentElement===home&&hero.nextSibling!==c){
      home.insertBefore(c,hero.nextSibling);
    }
    if(hero){const fruit=$('.hero-fruit');if(fruit)fruit.textContent='💧🚰';const h=hero.querySelector('h1');if(h)h.innerHTML='Drinking water,<br><em>delivered locally.</em>';const p=hero.querySelector('p');if(p)p.textContent='Choose your can size. Order in a few taps. Your local supplier takes care of the rest.';const eyebrow=hero.querySelector('.eyebrow');if(eyebrow)eyebrow.textContent='WATERNOW';}
    return c;
  }
  function cartChangesForStore(nextProducts){
    const snapshot=window.FreshWayCustomerCatalogue?.getCart?.()||{};
    const cart=snapshot.cart||{},snapshots=snapshot.cartProducts||{};
    const currentById=new Map(products.map(p=>[String(p.id),p]));
    const nextById=new Map(nextProducts.map(p=>[String(p.id),p]));
    const changes=[];
    for(const id of Object.keys(cart)){
      const previous=currentById.get(String(id))||snapshots[String(id)]||{};
      const next=nextById.get(String(id));
      if(!next){changes.push({name:previous.name||'Saved cart item',type:'unavailable',oldPrice:Number(previous.price)||0});continue}
      const oldPrice=Number(previous.price),newPrice=Number(next.price);
      if(Number.isFinite(oldPrice)&&Number.isFinite(newPrice)&&oldPrice!==newPrice){
        changes.push({name:next.name||previous.name||'Product',type:'price',oldPrice,newPrice});
      }
    }
    return changes;
  }
  async function switchToStore(store,{review=true}={}){
    const request=window.FreshWayCustomerAPI?.request;
    if(typeof request!=='function'||!store?.id)return {ok:false,reviewRequired:true};
    const storeId=String(store.id);
    const productResult=await request('/api/products?storeId='+encodeURIComponent(storeId));
    if(!Array.isArray(productResult?.products))throw new Error('We could not load the catalogue for '+String(store.name||'the selected store')+'. Please retry.');
    const nextProducts=productResult.products;
    const changes=cartChangesForStore(nextProducts);
    const cartState=window.FreshWayCustomerCatalogue?.getCart?.()||{};
    const hasCart=Object.keys(cartState.cart||{}).length>0;
    const previousStoreId=String(selectedStore?.id||selectedStoreIdValue||'');
    const changedStore=previousStoreId!==storeId;
    if(review&&hasCart&&(changedStore||changes.length)){
      const detail=changes.length?changes.map(x=>x.type==='unavailable'?x.name+' — not available at this store':x.name+' — ₹'+x.oldPrice.toLocaleString('en-IN')+' → ₹'+x.newPrice.toLocaleString('en-IN')).join('\n'):'All cart items remain available at the same prices.';
      const message='Your delivery will be fulfilled by '+String(store.name||'the selected store')+'.'+
        (changedStore?'\n\nYour delivery store is changing.':'')+'\n\n'+detail+
        '\n\nContinue and refresh your cart with this store’s catalogue and prices?';
      if(!window.confirm(message)){
        pendingStore=store;
        return {ok:false,reviewRequired:true,store,changes};
      }
    }
    selectedStore=store;
    selectedStoreIdValue=storeId;
    pendingStore=null;
    try{window.localStorage.setItem(STORE_STORAGE_KEY,storeId)}catch(_){}
    categories=[];
    products=nextProducts;
    selected=null;
    const sync=window.FreshWayCustomerCatalogue?.setProducts(products)||{};
    if(Number(sync.unavailable)>0)window.dispatchEvent(new CustomEvent('freshway:catalogue-sync',{detail:sync}));
    loading=false;ready=true;errorMessage='';errorCode='';
    renderHome();
    setMode(null,{history:'none'});
    if(changes.length)window.dispatchEvent(new CustomEvent('freshway:store-catalogue-changed',{detail:{store,changes}}));
    return {ok:true,changed:changedStore||changes.length>0,store,changes};
  }
  async function load({reviewChange=true,preserveExisting=true}={}){
    const token=++loadToken;
    const hadData=!!preserveExisting&&ready&&products.length>0;
    const request=window.FreshWayCustomerAPI?.request;
    loading=!hadData;errorMessage='';errorCode='';ready=hadData;
    if(!hadData)renderHome();
    if(typeof request!=='function'){
      loading=false;
      if(!hadData){
        errorMessage='WaterNow could not start the catalogue service. Please refresh and try again.';
        categories=[];products=[];window.FreshWayCustomerCatalogue?.clear();
      }
      renderHome();applyMode();return;
    }
    try{
      const address=window.FreshWayAddressSystem?.getSelectedAddress?.()||{};
      const resolved=await request('/api/delivery/store',{method:'POST',body:JSON.stringify({address})});
      if(token!==loadToken)return;
      if(resolved?.available!==true||!resolved?.store?.id){
        selectedStore=null;pendingStore=null;categories=[];products=[];
        window.FreshWayCustomerCatalogue?.clear();
        errorMessage=String(resolved?.message||'Confirm your delivery location to see products available near you.');
        errorCode=String(resolved?.code||'');
        loading=false;ready=false;renderHome();applyMode();return;
      }
      const result=await switchToStore(resolved.store,{review:reviewChange});
      if(token!==loadToken)return;
      if(!result?.ok){
        // Keep the previous store catalogue intact when the customer declines a
        // store-change prompt. Checkout will independently revalidate the address
        // and cannot silently fulfil from the old store.
        loading=false;ready=products.length>0;errorMessage='';
        renderHome();
        setMode(null,{history:'none'});
        applyMode();return;
      }
    }catch(error){
      if(token!==loadToken)return;
      loading=false;
      if(hadData){
        ready=true;errorMessage='';
        renderHome();
        setMode(null,{history:'none'});
        applyMode();return;
      }
      ready=false;
      errorMessage=error?.message||'We could not load the WaterNow catalogue. Please retry.';
      errorCode='';
      renderHome();applyMode();
    }
  }
  function renderHome(){
    const c=ensureUI();if(!c)return;
    let notice='';
    if(loading)notice='<p class="fw-location-needed" role="status">Checking delivery availability for your address…</p>';
    else if(errorCode==='AREA_UNAVAILABLE')notice='<div class="fw-location-needed" role="status">Delivery is not available at this address yet. Ask us about a nearby RTC bus stand handover or postal delivery options. <button type="button" data-fw-delivery-contact>Contact WaterNow</button></div>';
    else if(errorMessage)notice='<div class="fw-location-needed" role="status">Add or update your delivery address to check WaterNow products available in your area.<button type="button" data-fw-needs-location="address">Add delivery address</button><button type="button" class="fw-catalogue-retry" id="fwCatalogueRetry">Retry</button></div>';
    c.innerHTML=notice;
    c.hidden=!notice;
    const grid=$('#productGrid');
    if(grid)grid.classList.toggle('fw-category-home-hidden',!ready||loading||!!errorMessage);
  }
  function setMode(_categoryId,{history='none'}={}){
    selected=null;
    try{window.sessionStorage.removeItem('waternow-customer-selected-category')}catch(_){}
    document.body.classList.remove('fw-category-selected');
    const grid=$('#productGrid'),heading=$('.section-heading'),hero=$('.hero-banner');
    if(grid)grid.classList.remove('fw-category-home-hidden');
    if(heading){
      heading.classList.remove('fw-category-home-hidden');
      const label=heading.querySelector('.eyebrow'),title=heading.querySelector('h2');
      if(label)label.textContent='WATER PRODUCTS';
      if(title)title.textContent='Available water products';
    }
    if(hero)hero.classList.remove('fw-category-home-hidden');
    applyMode();
  }
  function applyMode(){
    const grid=$('#productGrid');if(!grid)return;
    if(!ready||loading||errorMessage){grid.classList.add('fw-category-home-hidden');return}
    grid.classList.remove('fw-category-home-hidden');
    const cards=[...grid.querySelectorAll('.product-card')];
    cards.forEach(card=>{card.style.display='';});
    const count=cards.length;
    const pill=$('.section-heading .count-pill');if(pill)pill.textContent=count+' '+(count===1?'item':'items');
    const title=$('.section-heading h2');if(title)title.textContent='Available water products';
    const eyebrow=$('.section-heading .eyebrow');if(eyebrow)eyebrow.textContent='WATER PRODUCTS';
  }
  function install(){
    ensureUI();
    document.addEventListener('click',e=>{if(e.target.closest('[data-fw-delivery-contact]')){e.preventDefault();window.setView?.('contact');return}if(e.target.closest('#fwCatalogueRetry')){e.preventDefault();load();return}if(e.target.closest('[data-fw-needs-location]')){e.preventDefault();e.stopImmediatePropagation();$('#addressBtn')?.click();return}},true);
  }
  window.FreshWayCustomerStoreCatalogue=Object.freeze({selectedStoreId:()=>selectedStore?.id||selectedStoreIdValue||'',selectedStore:()=>selectedStore,switchToStore,refresh:load});
  window.addEventListener('freshway:address-changed',()=>{void load({reviewChange:true,preserveExisting:false})});
  window.freshWayCustomerCatalogueRefresh=load;
  window.freshWayCustomerCatalogueGoHome=()=>setMode(null,{history:'none'});
  window.addEventListener('popstate',event=>{if(event.state?.__freshwayCustomer&&event.state.view==='home')setMode(null,{history:'none'})});
  install();load();
})();
const fwPushDestinationLoader=document.createElement('script');fwPushDestinationLoader.src='frontend/customer/push-destination.js?v=20260908-push-destination-v1';fwPushDestinationLoader.async=false;document.head.appendChild(fwPushDestinationLoader);