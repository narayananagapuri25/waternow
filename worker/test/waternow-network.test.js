import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleWaterNetworkRequest } from '../src/water-network.js';

class SQLiteD1 {
  constructor(){
    this.db=new DatabaseSync(':memory:');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
    this.db.exec(readFileSync(new URL('../migrations/0052_waternow_catalogue_seed.sql',import.meta.url),'utf8'));
  }
  prepare(sql){
    const owner=this;let args=[];
    const statement={
      bind(...values){args=values;return statement;},
      async first(){return owner.db.prepare(sql).get(...args)??null;},
      async all(){return {results:owner.db.prepare(sql).all(...args)};},
      async run(){const result=owner.db.prepare(sql).run(...args);return{meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid||0)}};}
    };
    return statement;
  }
  async batch(statements){
    this.db.exec('BEGIN');
    try{
      const results=[];
      for(const statement of statements)results.push(await statement.run());
      this.db.exec('COMMIT');
      return results;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  close(){this.db.close();}
}

const request=(path,body,method='POST')=>new Request('https://waternow.test/api/admin/'+path,{
  method,headers:{'content-type':'application/json'},
  ...(method==='GET'?{}:{body:JSON.stringify(body)})
});
const env=db=>({DB:db});

test('WaterNow clean-install schema exposes two priced-by-supplier water packs and network records',()=>{
  const db=new SQLiteD1();
  try{
    const categories=db.db.prepare('SELECT id,name,active FROM categories WHERE id LIKE ? ORDER BY display_order').all('water-%');
    const products=db.db.prepare('SELECT id,category_id,price,stock_managed FROM products WHERE id LIKE ? ORDER BY display_order').all('water-%');
    assert.deepEqual(categories.map(row=>row.id),['water-20l','water-10l-pair']);
    assert.deepEqual(products.map(row=>row.id),['water-20l','water-10l-pair']);
    assert.ok(products.every(row=>Number(row.active??1)===1));
    assert.ok(products.every(row=>Number(row.price)===0));
    assert.ok(products.every(row=>Number(row.stock_managed)===1));
    for(const table of ['water_suppliers','water_supplier_service_areas','water_supplier_products','water_delivery_partners','water_delivery_partner_service_areas','water_order_fulfilments']){
      assert.ok(db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table),table+' table must exist');
    }
    const columns=db.db.prepare('PRAGMA table_info(delivery_stores)').all().map(row=>row.name);
    assert.ok(columns.includes('supplier_id'));
    assert.ok(columns.includes('delivery_partner_id'));
    assert.ok(columns.includes('delivery_model'));
  }finally{db.close();}
});

test('WaterNow supplier approval gates customer delivery and links approved supplier pricing and stock to a delivery location',async()=>{
  const db=new SQLiteD1();
  try{
    db.db.prepare(`INSERT INTO delivery_stores(id,name,address,latitude,longitude,service_radius_km,is_active)
      VALUES('store-hyd','WaterNow Hyderabad Hub','Test address',17.385,78.4867,5,1)`).run();
    const created=await handleWaterNetworkRequest(request('water-suppliers',{
      name:'Local Water Works',supplierType:'distributor',phone:'9999999999',city:'Hyderabad',state:'Telangana',pincode:'500072',
      fssaiLicenseNumber:'12345678901234',fssaiLicenseExpiry:'2027-12-31',testingSchemeAcknowledged:true,
      fulfilmentModel:'platform_delivery',price20:120,stock20:8,price10:85,stock10:12
    }),env(db));
    assert.equal(created.status,201);
    const supplier=(await created.json()).supplier;
    assert.equal(supplier.compliance_status,'pending');
    assert.equal(Number(supplier.is_active),0);

    const partnerCreate=await handleWaterNetworkRequest(request('delivery-partners',{
      name:'City Water Delivery',phone:'9888888888',city:'Hyderabad',state:'Telangana',pincode:'500072',partnerType:'fleet'
    }),env(db));
    assert.equal(partnerCreate.status,201);
    const partner=(await partnerCreate.json()).partner;
    assert.equal(Number(partner.is_active),0);

    const blockedLink=await handleWaterNetworkRequest(request('water-suppliers/'+supplier.id+'/link-store',{
      storeId:'store-hyd',fulfilmentModel:'platform_delivery',deliveryPartnerId:partner.id
    }),env(db));
    assert.equal(blockedLink.status,400);
    assert.match((await blockedLink.json()).error,/verified and active delivery partner/i);

    const verifyPartner=await handleWaterNetworkRequest(request('delivery-partners/'+partner.id,{complianceStatus:'verified'},'PATCH'),env(db));
    assert.equal(verifyPartner.status,200);
    assert.equal(Number((await verifyPartner.json()).partner.is_active),1);

    const verified=await handleWaterNetworkRequest(request('water-suppliers/'+supplier.id,{
      complianceStatus:'verified',fssaiLicenseNumber:'12345678901234',fssaiLicenseExpiry:'2027-12-31',testingSchemeAcknowledged:true
    },'PATCH'),env(db));
    assert.equal(verified.status,200);
    assert.equal(Number((await verified.json()).supplier.is_active),1);

    const linked=await handleWaterNetworkRequest(request('water-suppliers/'+supplier.id+'/link-store',{
      storeId:'store-hyd',fulfilmentModel:'platform_delivery',deliveryPartnerId:partner.id
    }),env(db));
    assert.equal(linked.status,200);
    const store=db.db.prepare('SELECT supplier_id,delivery_partner_id,delivery_model,is_active FROM delivery_stores WHERE id=?').get('store-hyd');
    assert.equal(store.supplier_id,supplier.id);
    assert.equal(store.delivery_partner_id,partner.id);
    assert.equal(store.delivery_model,'platform_delivery');
    assert.equal(Number(store.is_active),1);

    const catalogue=db.db.prepare(`SELECT product_id,is_available,price_override FROM delivery_store_catalogue
      WHERE store_id='store-hyd' AND product_id IN ('water-20l','water-10l-pair') ORDER BY product_id`).all();
    assert.equal(catalogue.length,2);
    const twenty=db.db.prepare(`SELECT is_available,price_override FROM delivery_store_catalogue WHERE store_id='store-hyd' AND product_id='water-20l'`).get();
    assert.equal(Number(twenty.is_available),1);
    assert.equal(Number(twenty.price_override),120);
    const inventory=db.db.prepare(`SELECT stock_quantity FROM delivery_store_inventory WHERE store_id='store-hyd' AND product_id='water-20l'`).get();
    assert.equal(Number(inventory.stock_quantity),8);
  }finally{db.close();}
});

test('WaterNow refuses supplier verification without an unexpired FSSAI record and water-testing review',async()=>{
  const db=new SQLiteD1();
  try{
    const created=await handleWaterNetworkRequest(request('water-suppliers',{
      name:'Pending Water Supplier',supplierType:'retailer',phone:'9777777777',city:'Warangal',state:'Telangana',
      fssaiLicenseNumber:'12345678901234',price20:100,stock20:10
    }),env(db));
    const supplier=(await created.json()).supplier;
    const missingTesting=await handleWaterNetworkRequest(request('water-suppliers/'+supplier.id,{
      complianceStatus:'verified',fssaiLicenseNumber:'12345678901234',fssaiLicenseExpiry:'2027-12-31',testingSchemeAcknowledged:false
    },'PATCH'),env(db));
    assert.equal(missingTesting.status,400);
    assert.match((await missingTesting.json()).error,/testing scheme records/i);
    const expired=await handleWaterNetworkRequest(request('water-suppliers/'+supplier.id,{
      complianceStatus:'verified',fssaiLicenseNumber:'12345678901234',fssaiLicenseExpiry:'2020-01-01',testingSchemeAcknowledged:true
    },'PATCH'),env(db));
    assert.equal(expired.status,400);
    assert.match((await expired.json()).error,/unexpired/i);
    const stillPending=db.db.prepare('SELECT is_active,compliance_status FROM water_suppliers WHERE id=?').get(supplier.id);
    assert.equal(Number(stillPending.is_active),0);
    assert.equal(stillPending.compliance_status,'pending');
  }finally{db.close();}
});
