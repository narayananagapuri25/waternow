import { ensureStoreCatalogueRows } from './store-catalogue.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const clean=(value,max=160)=>String(value??'').trim().slice(0,max);
const bool=value=>value===true||value===1||value==='1';
const validType=(value,allowed)=>allowed.includes(String(value||''));
const today=()=>new Date().toISOString().slice(0,10);

async function readBody(request){try{return await request.json()}catch(_){throw new Error('Send valid JSON data.')}}

async function listNetwork(env){
  const [supplierRows,partnerRows]=await Promise.all([
    env.DB.prepare(`SELECT s.*,
      (SELECT COUNT(*) FROM water_supplier_products p WHERE p.supplier_id=s.id) AS product_count,
      (SELECT COUNT(*) FROM water_supplier_service_areas a WHERE a.supplier_id=s.id AND a.is_active=1) AS service_area_count,
      (SELECT id FROM delivery_stores d WHERE d.supplier_id=s.id ORDER BY d.id LIMIT 1) AS linked_store_id,
      (SELECT delivery_model FROM delivery_stores d WHERE d.supplier_id=s.id ORDER BY d.id LIMIT 1) AS linked_delivery_model
      FROM water_suppliers s ORDER BY s.city,s.name`).all(),
    env.DB.prepare(`SELECT p.*,
      (SELECT COUNT(*) FROM water_delivery_partner_service_areas a WHERE a.partner_id=p.id AND a.is_active=1) AS service_area_count
      FROM water_delivery_partners p ORDER BY p.city,p.name`).all()
  ]);
  const [supplierProducts,deliveryStores]=await Promise.all([
    env.DB.prepare(`SELECT sp.supplier_id,sp.product_id,p.name AS product_name,sp.selling_price,
      COALESCE((SELECT i.stock_quantity FROM delivery_store_inventory i JOIN delivery_stores d ON d.id=i.store_id WHERE d.supplier_id=sp.supplier_id AND i.product_id=sp.product_id LIMIT 1),sp.stock_quantity) AS stock_quantity,
      CASE WHEN sp.selling_price>0 AND COALESCE((SELECT i.stock_quantity FROM delivery_store_inventory i JOIN delivery_stores d ON d.id=i.store_id WHERE d.supplier_id=sp.supplier_id AND i.product_id=sp.product_id LIMIT 1),sp.stock_quantity)>0 THEN 1 ELSE 0 END AS is_available
      FROM water_supplier_products sp JOIN products p ON p.id=sp.product_id
      ORDER BY p.display_order,p.name`).all(),
    env.DB.prepare(`SELECT id,name,address,service_radius_km,is_active,supplier_id,delivery_model,delivery_partner_id FROM delivery_stores ORDER BY name`).all()
  ]);
  return {suppliers:supplierRows.results||[],deliveryPartners:partnerRows.results||[],
    supplierProducts:supplierProducts.results||[],deliveryStores:deliveryStores.results||[]};
}

function validateSupplier(payload){
  const name=clean(payload.name,120),phone=clean(payload.phone,24),city=clean(payload.city,80);
  const supplierType=String(payload.supplierType||'distributor');
  const state=clean(payload.state,80),pincode=clean(payload.pincode,6);
  const fulfilmentModel=String(payload.fulfilmentModel||'supplier_delivery');
  if(!name||!phone||!city)throw new Error('Enter the supplier name, phone number and city.');
  if(!/^[+0-9() -]{8,24}$/.test(phone))throw new Error('Enter a valid supplier phone number.');
  if(!validType(supplierType,['producer','distributor','retailer']))throw new Error('Choose a valid supplier type.');
  if(pincode&&!/^\d{6}$/.test(pincode))throw new Error('Enter a valid 6-digit PIN code.');
  if(!validType(fulfilmentModel,['supplier_delivery','platform_delivery']))throw new Error('Choose a valid fulfilment model.');
  return {name,phone,city,supplierType,state,pincode,fulfilmentModel,
    fssaiLicenseNumber:clean(payload.fssaiLicenseNumber,40),
    fssaiLicenseExpiry:clean(payload.fssaiLicenseExpiry,10),
    testingSchemeAcknowledged:bool(payload.testingSchemeAcknowledged)?1:0,
    contactPerson:clean(payload.contactPerson,120),
    email:clean(payload.email,200),
    address:clean(payload.address,500),
    price20:Math.max(0,Number.isSafeInteger(Number(payload.price20))?Number(payload.price20):0),
    price10:Math.max(0,Number.isSafeInteger(Number(payload.price10))?Number(payload.price10):0),
    stock20:Math.max(0,Number.isSafeInteger(Number(payload.stock20))?Number(payload.stock20):0),
    stock10:Math.max(0,Number.isSafeInteger(Number(payload.stock10))?Number(payload.stock10):0)
  };
}

async function createSupplier(env,payload){
  const data=validateSupplier(payload),id=crypto.randomUUID();
  const statements=[env.DB.prepare(`INSERT INTO water_suppliers
    (id,name,supplier_type,contact_person,phone,city,state,pincode,email,address,fulfilment_model,
     fssai_license_number,fssai_license_expiry,water_testing_scheme_acknowledged,compliance_status,is_active)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',0)`)
    .bind(id,data.name,data.supplierType,data.contactPerson,data.phone,data.city,data.state,data.pincode,
      data.email,data.address,data.fulfilmentModel,data.fssaiLicenseNumber,data.fssaiLicenseExpiry||null,
      data.testingSchemeAcknowledged)];
  if(data.price20||data.stock20)statements.push(env.DB.prepare(`INSERT INTO water_supplier_products
    (supplier_id,product_id,selling_price,stock_quantity,is_available)
    VALUES (?,'water-20l',?,?,?)`).bind(id,data.price20,data.stock20,data.price20>0&&data.stock20>0?1:0));
  else statements.push(env.DB.prepare(`INSERT INTO water_supplier_products
    (supplier_id,product_id,selling_price,stock_quantity,is_available) VALUES (?,'water-20l',0,0,0)`).bind(id));
  if(data.price10||data.stock10)statements.push(env.DB.prepare(`INSERT INTO water_supplier_products
    (supplier_id,product_id,selling_price,stock_quantity,is_available)
    VALUES (?,'water-10l-pair',?,?,?)`).bind(id,data.price10,data.stock10,data.price10>0&&data.stock10>0?1:0));
  else statements.push(env.DB.prepare(`INSERT INTO water_supplier_products
    (supplier_id,product_id,selling_price,stock_quantity,is_available) VALUES (?,'water-10l-pair',0,0,0)`).bind(id));
  statements.push(env.DB.prepare(`INSERT OR IGNORE INTO water_supplier_service_areas
    (id,supplier_id,city,state,pincode) VALUES (?,?,?,?,?)`).bind(crypto.randomUUID(),id,data.city,data.state,data.pincode));
  await env.DB.batch(statements);
  return (await listNetwork(env)).suppliers.find(item=>item.id===id);
}

async function updateSupplier(env,id,payload){
  const current=await env.DB.prepare('SELECT * FROM water_suppliers WHERE id=?').bind(id).first();
  if(!current)throw new Error('Water supplier not found.');
  const status=String(payload.complianceStatus||current.compliance_status);
  if(!validType(status,['pending','under_review','verified','suspended']))throw new Error('Choose a valid compliance status.');
  const license=clean(payload.fssaiLicenseNumber??current.fssai_license_number,40);
  const expiry=clean(payload.fssaiLicenseExpiry??current.fssai_license_expiry,10);
  const testing=bool(payload.testingSchemeAcknowledged??current.water_testing_scheme_acknowledged)?1:0;
  if(status==='verified'){
    if(!license)throw new Error('A verified supplier must have an applicable FSSAI licence or registration number.');
    if(!expiry||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(expiry)||expiry<today())
      throw new Error('Enter a valid, unexpired FSSAI licence or registration expiry date before verification.');
    if(!testing)throw new Error('Confirm that the applicable packaged-water testing scheme records have been reviewed before verification.');
  }
  const note=clean(payload.complianceNote??current.compliance_note,1000);
  const active=status==='verified'?1:0;
  await env.DB.batch([
    env.DB.prepare(`UPDATE water_suppliers SET
      fssai_license_number=?,fssai_license_expiry=?,water_testing_scheme_acknowledged=?,
      compliance_status=?,compliance_note=?,verified_at=CASE WHEN ?='verified' THEN CURRENT_TIMESTAMP ELSE NULL END,
      is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(license,expiry||null,testing,status,note,status,active,id),
    env.DB.prepare(`UPDATE delivery_stores SET
      is_active=CASE WHEN ?=1 AND (delivery_model<>'platform_delivery' OR EXISTS (
        SELECT 1 FROM water_delivery_partners p WHERE p.id=delivery_stores.delivery_partner_id AND p.is_active=1
      )) THEN 1 ELSE 0 END,
      updated_at=CURRENT_TIMESTAMP WHERE supplier_id=?`).bind(active,id)
  ]);
  return {supplier:await env.DB.prepare('SELECT * FROM water_suppliers WHERE id=?').bind(id).first()};
}

async function updateSupplierProduct(env,supplierId,productId,payload){
  if(!['water-20l','water-10l-pair'].includes(productId))throw new Error('Unknown WaterNow water pack.');
  const price=Number(payload.sellingPrice),stock=Number(payload.stockQuantity);
  if(!Number.isSafeInteger(price)||price<0||price>10000000)throw new Error('Enter a valid supplier selling price in whole rupees.');
  if(!Number.isSafeInteger(stock)||stock<0||stock>100000)throw new Error('Enter a valid available stock quantity.');
  const supplier=await env.DB.prepare('SELECT id,is_active FROM water_suppliers WHERE id=?').bind(supplierId).first();
  if(!supplier)throw new Error('Water supplier not found.');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO water_supplier_products
      (supplier_id,product_id,selling_price,stock_quantity,is_available,updated_at)
      VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(supplier_id,product_id) DO UPDATE SET
        selling_price=excluded.selling_price,stock_quantity=excluded.stock_quantity,
        is_available=excluded.is_available,updated_at=CURRENT_TIMESTAMP`)
      .bind(supplierId,productId,price,stock,price>0&&stock>0?1:0),
    env.DB.prepare(`UPDATE delivery_store_catalogue SET is_available=?,price_override=?,updated_at=CURRENT_TIMESTAMP
      WHERE product_id=? AND store_id IN (SELECT id FROM delivery_stores WHERE supplier_id=?)`)
      .bind(price>0&&stock>0?1:0,price>0?price:null,productId,supplierId),
    env.DB.prepare(`UPDATE delivery_store_inventory SET stock_quantity=?,updated_at=CURRENT_TIMESTAMP
      WHERE product_id=? AND store_id IN (SELECT id FROM delivery_stores WHERE supplier_id=?)`)
      .bind(stock,productId,supplierId)
  ]);
  return {ok:true};
}

async function linkSupplierStore(env,supplierId,payload){
  const supplier=await env.DB.prepare('SELECT * FROM water_suppliers WHERE id=?').bind(supplierId).first();
  if(!supplier)throw new Error('Water supplier not found.');
  const storeId=clean(payload.storeId,120),model=String(payload.fulfilmentModel||supplier.fulfilment_model),partnerId=clean(payload.deliveryPartnerId,120);
  if(!storeId)throw new Error('Choose a delivery location to link.');
  if(!validType(model,['supplier_delivery','platform_delivery']))throw new Error('Choose a valid fulfilment model.');
  const store=await env.DB.prepare('SELECT id,supplier_id FROM delivery_stores WHERE id=?').bind(storeId).first();
  if(!store)throw new Error('Delivery location not found. Add it in the Stores screen first.');
  if(store.supplier_id&&String(store.supplier_id)!==String(supplierId))throw new Error('This delivery location is already linked to another supplier. Unlink the existing supplier before changing it.');
  const otherLinkedStore=await env.DB.prepare('SELECT id,name FROM delivery_stores WHERE supplier_id=? AND id<>? LIMIT 1').bind(supplierId,storeId).first();
  if(otherLinkedStore)throw new Error('This supplier is already linked to '+otherLinkedStore.name+'. Use one dispatch location per supplier; expand its service radius or register a separate dispatch location as another supplier.');
  if(model==='platform_delivery'){
    if(!partnerId)throw new Error('Choose a verified WaterNow delivery partner for platform delivery.');
    const partner=await env.DB.prepare('SELECT id,is_active FROM water_delivery_partners WHERE id=?').bind(partnerId).first();
    if(!partner||Number(partner.is_active)!==1)throw new Error('Choose a verified and active delivery partner.');
    const coverage=await env.DB.prepare(`SELECT 1 AS matched
      FROM water_delivery_partner_service_areas pa
      JOIN water_supplier_service_areas sa
        ON lower(trim(pa.city))=lower(trim(sa.city))
       AND (trim(pa.state)='' OR trim(sa.state)='' OR lower(trim(pa.state))=lower(trim(sa.state)))
       AND (trim(pa.pincode)='' OR trim(sa.pincode)='' OR trim(pa.pincode)=trim(sa.pincode))
      WHERE pa.partner_id=? AND pa.is_active=1 AND sa.supplier_id=? AND sa.is_active=1
      LIMIT 1`).bind(partnerId,supplierId).first();
    if(!coverage)throw new Error('The selected delivery partner does not cover this supplier’s service area.');
  }
  await ensureStoreCatalogueRows(env,storeId);
  const active=Number(supplier.is_active)===1?1:0;
  const statements=[
    env.DB.prepare('UPDATE delivery_stores SET supplier_id=?,delivery_model=?,delivery_partner_id=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(supplierId,model,model==='platform_delivery'?partnerId:null,active,storeId),
    ...['water-20l','water-10l-pair'].map(productId=>env.DB.prepare(`UPDATE delivery_store_catalogue SET
      is_available=COALESCE((SELECT is_available FROM water_supplier_products WHERE supplier_id=? AND product_id=?),0),
      price_override=(SELECT CASE WHEN selling_price>0 THEN selling_price ELSE NULL END FROM water_supplier_products WHERE supplier_id=? AND product_id=?),
      updated_at=CURRENT_TIMESTAMP WHERE store_id=? AND product_id=?`)
      .bind(supplierId,productId,supplierId,productId,storeId,productId)),
    ...['water-20l','water-10l-pair'].map(productId=>env.DB.prepare(`UPDATE delivery_store_inventory SET
      stock_quantity=COALESCE((SELECT stock_quantity FROM water_supplier_products WHERE supplier_id=? AND product_id=?),0),
      updated_at=CURRENT_TIMESTAMP WHERE store_id=? AND product_id=?`)
      .bind(supplierId,productId,storeId,productId))
  ];
  await env.DB.batch(statements);
  return {ok:true,store:await env.DB.prepare('SELECT id,name,supplier_id,delivery_model,delivery_partner_id,is_active FROM delivery_stores WHERE id=?').bind(storeId).first()};
}

async function createPartner(env,payload){
  const name=clean(payload.name,120),phone=clean(payload.phone,24),city=clean(payload.city,80);
  const partnerType=String(payload.partnerType||'individual'),state=clean(payload.state,80),pincode=clean(payload.pincode,6);
  if(!name||!phone||!city)throw new Error('Enter the partner name, phone number and city.');
  if(!/^[+0-9() -]{8,24}$/.test(phone))throw new Error('Enter a valid delivery partner phone number.');
  if(!validType(partnerType,['individual','fleet','supplier_staff']))throw new Error('Choose a valid delivery partner type.');
  if(pincode&&!/^\d{6}$/.test(pincode))throw new Error('Enter a valid 6-digit PIN code.');
  const id=crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO water_delivery_partners
      (id,name,partner_type,phone,city,state,pincode,compliance_status,is_active)
      VALUES (?,?,?,?,?,?,?,'pending',0)`).bind(id,name,partnerType,phone,city,state,pincode),
    env.DB.prepare(`INSERT OR IGNORE INTO water_delivery_partner_service_areas
      (id,partner_id,city,state,pincode) VALUES (?,?,?,?,?)`).bind(crypto.randomUUID(),id,city,state,pincode)
  ]);
  return {partner:await env.DB.prepare('SELECT * FROM water_delivery_partners WHERE id=?').bind(id).first()};
}

async function updatePartner(env,id,payload){
  const current=await env.DB.prepare('SELECT * FROM water_delivery_partners WHERE id=?').bind(id).first();
  if(!current)throw new Error('Delivery partner not found.');
  const status=String(payload.complianceStatus||current.compliance_status);
  if(!validType(status,['pending','verified','suspended']))throw new Error('Choose a valid delivery partner status.');
  const active=status==='verified'?1:0;
  await env.DB.batch([
    env.DB.prepare('UPDATE water_delivery_partners SET compliance_status=?,is_active=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(status,active,clean(payload.notes??current.notes,1000),id),
    env.DB.prepare(`UPDATE delivery_stores SET
      is_active=CASE WHEN ?=1 THEN is_active ELSE 0 END,
      updated_at=CURRENT_TIMESTAMP
      WHERE delivery_model='platform_delivery' AND delivery_partner_id=?`)
      .bind(active,id)
  ]);
  return {partner:await env.DB.prepare('SELECT * FROM water_delivery_partners WHERE id=?').bind(id).first()};
}

export async function handleWaterNetworkRequest(request,env){
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(path==='/api/admin/water-network'&&method==='GET')return json(await listNetwork(env));
  if(path==='/api/admin/water-suppliers'&&method==='POST'){
    try{return json({supplier:await createSupplier(env,await readBody(request))},201)}
    catch(error){return json({error:error.message||'Could not add the water supplier.'},400)}
  }
  const storeLink=path.match(/^\/api\/admin\/water-suppliers\/([^/]+)\/link-store$/);
  if(storeLink&&method==='POST'){
    try{return json(await linkSupplierStore(env,decodeURIComponent(storeLink[1]),await readBody(request)))}
    catch(error){return json({error:error.message||'Could not link supplier to this delivery location.'},400)}
  }
  const supplierProduct=path.match(/^\/api\/admin\/water-suppliers\/([^/]+)\/products\/(water-20l|water-10l-pair)$/);
  if(supplierProduct&&method==='PATCH'){
    try{return json(await updateSupplierProduct(env,decodeURIComponent(supplierProduct[1]),supplierProduct[2],await readBody(request)))}
    catch(error){return json({error:error.message||'Could not save supplier pricing.'},400)}
  }
  const supplier=path.match(/^\/api\/admin\/water-suppliers\/([^/]+)$/);
  if(supplier&&method==='PATCH'){
    try{return json(await updateSupplier(env,decodeURIComponent(supplier[1]),await readBody(request)))}
    catch(error){return json({error:error.message||'Could not update supplier compliance.'},400)}
  }
  if(path==='/api/admin/delivery-partners'&&method==='POST'){
    try{return json(await createPartner(env,await readBody(request)),201)}
    catch(error){return json({error:error.message||'Could not add the delivery partner.'},400)}
  }
  const partner=path.match(/^\/api\/admin\/delivery-partners\/([^/]+)$/);
  if(partner&&method==='PATCH'){
    try{return json(await updatePartner(env,decodeURIComponent(partner[1]),await readBody(request)))}
    catch(error){return json({error:error.message||'Could not update delivery partner.'},400)}
  }
  return null;
}
