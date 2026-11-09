(function(){
  'use strict';
  const $=selector=>document.querySelector(selector);
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money=value=>'₹'+Number(value||0).toLocaleString('en-IN');
  const statusLabel=value=>({pending:'Pending review',under_review:'Under review',verified:'Verified',suspended:'Suspended'}[value]||value||'Pending');
  async function api(path,options={}){
    const response=await fetch(path,{...options,credentials:'include',cache:'no-store',headers:{'content-type':'application/json',...(options.headers||{})}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'The request could not be completed.');
    return data;
  }
  let network={suppliers:[],deliveryPartners:[],supplierProducts:[],deliveryStores:[]};
  function productsFor(supplierId){return network.supplierProducts.filter(item=>String(item.supplier_id)===String(supplierId))}
  function renderSuppliers(){
    const host=$('#waterSupplierList');if(!host)return;
    host.innerHTML=network.suppliers.map(supplier=>{
      const offers=productsFor(supplier.id);
      const active=Number(supplier.is_active)===1;
      const storeOptions=network.deliveryStores.map(store=>'<option value="'+esc(store.id)+'" '+(String(store.id)===String(supplier.linked_store_id||'')?'selected':'')+'>'+esc(store.name)+'</option>').join('');
      const partnerOptions=network.deliveryPartners.filter(partner=>Number(partner.is_active)===1).map(partner=>'<option value="'+esc(partner.id)+'">'+esc(partner.name)+' · '+esc(partner.city)+'</option>').join('');
      const products=offers.map(item=>`<form class="water-offer-form" data-water-offer data-supplier-id="${esc(supplier.id)}" data-product-id="${esc(item.product_id)}">
        <strong>${esc(item.product_name)}</strong>
        <label>Price <input name="price" type="number" min="0" step="1" value="${Number(item.selling_price||0)}" aria-label="Price for ${esc(item.product_name)}"></label>
        <label>Stock <input name="stock" type="number" min="0" step="1" value="${Number(item.stock_quantity||0)}" aria-label="Stock for ${esc(item.product_name)}"></label>
        <button type="submit" class="ghost">Save</button><small>${Number(item.is_available)===1?'Available':'Not orderable yet'}</small>
      </form>`).join('');
      return `<article class="water-network-card">
        <div class="water-network-card-head"><div><h3>${esc(supplier.name)}</h3><p>${esc(supplier.city)}${supplier.state?', '+esc(supplier.state):''} · ${esc(supplier.phone)}</p></div><span class="water-status ${active?'is-active':'is-pending'}">${active?'Active':statusLabel(supplier.compliance_status)}</span></div>
        <div class="water-network-meta"><span>${esc(supplier.supplier_type)}</span><span>${supplier.fulfilment_model==='platform_delivery'?'WaterNow delivery':'Supplier delivery'}</span><span>${Number(supplier.service_area_count||0)} service areas</span></div>
        <p class="water-network-compliance">FSSAI: ${esc(supplier.fssai_license_number||'Not entered')} · Expires: ${esc(supplier.fssai_license_expiry||'Not entered')} · Water testing records: ${Number(supplier.water_testing_scheme_acknowledged)===1?'Confirmed':'Not confirmed'}</p>
        <div class="water-offer-list">${products||'<p class="empty">No water pack prices entered.</p>'}</div>
        <div class="water-network-actions">${active?'<span class="water-compliance-confirmed">Verified supplier</span>':`<button type="button" class="primary" data-water-verify-supplier="${esc(supplier.id)}">Verify compliance</button>`}</div>
        ${network.deliveryStores.length?`<form class="water-link-store-form" data-water-link-store data-supplier-id="${esc(supplier.id)}"><label>Delivery location<select name="storeId" required><option value="">Choose configured store</option>${storeOptions}</select></label><label>Delivery model<select name="fulfilmentModel"><option value="supplier_delivery" ${(supplier.linked_delivery_model||'supplier_delivery')==='supplier_delivery'?'selected':''}>Supplier delivers</option><option value="platform_delivery" ${supplier.linked_delivery_model==='platform_delivery'?'selected':''}>WaterNow delivery</option></select></label><label>WaterNow delivery partner<select name="deliveryPartnerId"><option value="">Choose partner when using WaterNow delivery</option>${partnerOptions}</select></label><button type="submit" class="ghost">Link location</button></form>`:'<p class="water-network-compliance">Create a delivery location with a precise map pin in Stores before linking this supplier.</p><button class="ghost" type="button" data-screen="stores">Open delivery locations</button>'}
      </article>`;
    }).join('')||'<div class="empty">No suppliers onboarded yet. Add a trusted local supplier to begin.</div>';
  }
  function renderPartners(){
    const host=$('#waterPartnerList');if(!host)return;
    host.innerHTML=network.deliveryPartners.map(partner=>{
      const active=Number(partner.is_active)===1;
      return `<article class="water-network-card">
        <div class="water-network-card-head"><div><h3>${esc(partner.name)}</h3><p>${esc(partner.city)}${partner.state?', '+esc(partner.state):''} · ${esc(partner.phone)}</p></div><span class="water-status ${active?'is-active':'is-pending'}">${active?'Active':statusLabel(partner.compliance_status)}</span></div>
        <div class="water-network-meta"><span>${esc(partner.partner_type)}</span><span>${Number(partner.service_area_count||0)} service areas</span></div>
        ${active?'':`<div class="water-network-actions"><button type="button" class="ghost" data-water-verify-partner="${esc(partner.id)}">Verify partner</button></div>`}
      </article>`;
    }).join('')||'<div class="empty">No delivery partners added yet.</div>';
  }
  async function load(){
    const host=$('#waterSupplierList');if(host)host.innerHTML='<div class="empty">Loading supplier network…</div>';
    const data=await api('/api/admin/water-network');
    network={suppliers:Array.isArray(data.suppliers)?data.suppliers:[],deliveryPartners:Array.isArray(data.deliveryPartners)?data.deliveryPartners:[],supplierProducts:Array.isArray(data.supplierProducts)?data.supplierProducts:[],deliveryStores:Array.isArray(data.deliveryStores)?data.deliveryStores:[]};
    renderSuppliers();renderPartners();
    return network;
  }
  async function addSupplier(event){
    event.preventDefault();
    const button=event.submitter,old=button?.textContent;if(button){button.disabled=true;button.textContent='Saving…'}
    const value=id=>$('#'+id)?.value||'';
    const payload={
      name:value('wnSupplierName'),supplierType:value('wnSupplierType'),phone:value('wnSupplierPhone'),
      city:value('wnSupplierCity'),state:value('wnSupplierState'),pincode:value('wnSupplierPin'),
      fssaiLicenseNumber:value('wnSupplierFssai'),fssaiLicenseExpiry:value('wnSupplierExpiry'),
      testingSchemeAcknowledged:$('#wnTestingScheme')?.checked===true,
      fulfilmentModel:value('wnFulfilment'),
      price20:value('wnPrice20'),stock20:value('wnStock20'),
      price10:value('wnPrice10'),stock10:value('wnStock10')
    };
    try{
      await api('/api/admin/water-suppliers',{method:'POST',body:JSON.stringify(payload)});
      event.target.reset();const message=$('#wnSupplierStatus');if(message)message.textContent='Supplier added. It is pending compliance review and cannot receive orders yet.';
      await load();
    }catch(error){const message=$('#wnSupplierStatus');if(message)message.textContent=error.message}
    finally{if(button){button.disabled=false;button.textContent=old||'Add supplier'}}
  }
  async function addPartner(event){
    event.preventDefault();
    const button=event.submitter,old=button?.textContent;if(button){button.disabled=true;button.textContent='Saving…'}
    const value=id=>$('#'+id)?.value||'';
    try{
      await api('/api/admin/delivery-partners',{method:'POST',body:JSON.stringify({
        name:value('wnPartnerName'),phone:value('wnPartnerPhone'),city:value('wnPartnerCity'),
        state:value('wnPartnerState'),pincode:value('wnPartnerPin'),partnerType:value('wnPartnerType')
      })});
      event.target.reset();const message=$('#wnPartnerStatus');if(message)message.textContent='Delivery partner added. Verify identity and operating details before activation.';
      await load();
    }catch(error){const message=$('#wnPartnerStatus');if(message)message.textContent=error.message}
    finally{if(button){button.disabled=false;button.textContent=old||'Add delivery partner'}}
  }
  async function handleSubmit(event){
    const linkForm=event.target.closest('[data-water-link-store]');
    if(linkForm){event.preventDefault();const button=event.submitter;if(button)button.disabled=true;const form=new FormData(linkForm);try{await api('/api/admin/water-suppliers/'+encodeURIComponent(linkForm.dataset.supplierId)+'/link-store',{method:'POST',body:JSON.stringify({storeId:form.get('storeId'),fulfilmentModel:form.get('fulfilmentModel'),deliveryPartnerId:form.get('deliveryPartnerId')})});await load()}catch(error){window.alert(error.message)}finally{if(button)button.disabled=false}return}
    const offer=event.target.closest('[data-water-offer]');if(!offer)return;
    event.preventDefault();const button=event.submitter;if(button)button.disabled=true;
    const form=new FormData(offer);
    try{
      await api('/api/admin/water-suppliers/'+encodeURIComponent(offer.dataset.supplierId)+'/products/'+encodeURIComponent(offer.dataset.productId),{
        method:'PATCH',body:JSON.stringify({sellingPrice:form.get('price'),stockQuantity:form.get('stock')})
      });
      await load();
    }catch(error){window.alert(error.message)}
    finally{if(button)button.disabled=false}
  }
  async function handleClick(event){
    const supplierButton=event.target.closest('[data-water-verify-supplier]');
    if(supplierButton){
      const supplier=network.suppliers.find(item=>item.id===supplierButton.dataset.waterVerifySupplier);
      if(!supplier)return;
      if(!window.confirm('Confirm that the supplier’s current FSSAI licence / registration and applicable packaged-water testing records have been independently reviewed?'))return;
      supplierButton.disabled=true;
      try{
        await api('/api/admin/water-suppliers/'+encodeURIComponent(supplier.id),{
          method:'PATCH',body:JSON.stringify({complianceStatus:'verified',fssaiLicenseNumber:supplier.fssai_license_number,
            fssaiLicenseExpiry:supplier.fssai_license_expiry,testingSchemeAcknowledged:Number(supplier.water_testing_scheme_acknowledged)===1})
        });
        await load();
      }catch(error){window.alert(error.message);supplierButton.disabled=false}
      return;
    }
    const partnerButton=event.target.closest('[data-water-verify-partner]');
    if(partnerButton){
      if(!window.confirm('Confirm that this delivery partner’s identity, contact details and operating arrangement have been checked?'))return;
      partnerButton.disabled=true;
      try{
        await api('/api/admin/delivery-partners/'+encodeURIComponent(partnerButton.dataset.waterVerifyPartner),{
          method:'PATCH',body:JSON.stringify({complianceStatus:'verified'})
        });
        await load();
      }catch(error){window.alert(error.message);partnerButton.disabled=false}
    }
  }
  function init(){
    $('#waterSupplierForm')?.addEventListener('submit',addSupplier);
    $('#waterPartnerForm')?.addEventListener('submit',addPartner);
    document.addEventListener('submit',handleSubmit);
    document.addEventListener('click',handleClick);
    document.addEventListener('change',event=>{if(event.target.matches('select[name="fulfilmentModel"]')){const form=event.target.closest('[data-water-link-store]');const partner=form?.querySelector('select[name="deliveryPartnerId"]');if(partner)partner.disabled=event.target.value!=='platform_delivery'}});
    $('#wnRefresh')?.addEventListener('click',()=>load().catch(error=>window.alert(error.message)));
    document.addEventListener('freshway:admin-authenticated',()=>{load().catch(()=>{})});
    window.FreshWayOwnerWaterNetwork=Object.freeze({load,refresh:load});
  }
  init();
})();