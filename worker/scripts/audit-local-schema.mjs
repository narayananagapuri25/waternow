import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const schema=readFileSync(resolve(root,'schema.sql'),'utf8');

// Local-only schema contract. This intentionally does not run Wrangler, access
// a remote D1 database, or require production credentials.
const required={
  customers: ['id','name','phone','passcode_salt','deleted_at','auth_version'],
  orders: ['id','customer_id','address_id','scheduled_delivery_date','scheduled_slot_id','assigned_store_id','scheduled_start_minute','scheduled_end_minute','schedule_status','delivered_at','is_test_order','pricing_breakdown_known'],
  store_profile: ['id','store_name','about','phone','whatsapp','email','address','shop_latitude','shop_longitude','business_hours','delivery_info','share_title','share_description','created_at','updated_at'],
  delivery_scheduling_settings: ['id','enabled','booking_horizon_days','same_day_cutoff_minutes','timezone'],
  delivery_stores: ['id','name','address','latitude','longitude','service_radius_km','is_active','supplier_id','delivery_partner_id','delivery_model'],
  delivery_store_inventory: ['store_id','product_id','stock_quantity'],
  delivery_store_catalogue: ['store_id','product_id','is_available','price_override'],
  delivery_slots: ['id','store_id','delivery_date','start_minute','end_minute','capacity'],
  delivery_slot_reservations: ['id','order_id','slot_id','status'],
  delivery_store_inventory_reservations: ['id','order_id','store_id','product_id','qty','status'],
  order_action_requests: ['id','order_id','customer_id','request_type','reason','status'],
  order_audit_events: ['id','order_id','actor_type','action'],
  order_operational_flags: ['id','order_id','flag_type'],
  account_deletion_requests: ['id','customer_id','phone_snapshot','status','source','admin_note'],
  account_deletion_summary: ['id','completed_count','latest_completed_at'],
  order_address_snapshots: ['order_id','customer_id','address_id','recipient_name','delivery_phone','house_flat','delivery_note','place_name','place_id'],
  water_suppliers: ['id','name','supplier_type','phone','city','fssai_license_number','fssai_license_expiry','compliance_status','is_active'],
  water_supplier_service_areas: ['id','supplier_id','city','state','pincode','radius_km','is_active'],
  water_supplier_products: ['supplier_id','product_id','selling_price','stock_quantity','is_available'],
  water_delivery_partners: ['id','name','partner_type','phone','city','compliance_status','is_active'],
  water_delivery_partner_service_areas: ['id','partner_id','city','state','pincode','is_active'],
  water_order_fulfilments: ['id','order_id','supplier_id','delivery_partner_id','fulfilment_model','status']
};

const requiredIndexes=[
  'idx_orders_test_created',
  'idx_customers_active_phone',
  'idx_account_deletion_requests_one_active',
  'idx_account_deletion_requests_status_created',
  'idx_account_deletion_requests_customer_created',
  'idx_addresses_customer_saved_default',
  'idx_order_address_snapshots_customer',
  'idx_order_address_snapshots_location',
  'idx_delivery_store_catalogue_visible',
  'idx_water_suppliers_city_status',
  'idx_water_supplier_areas_lookup',
  'idx_water_supplier_products_available',
  'idx_water_delivery_partners_city_status',
  'idx_water_fulfilments_supplier_status'
];

const requiredMigrations=[
  '0036_anonymize_completed_deletion_requests.sql',
  '0037_order_delivery_scheduling.sql',
  '0038_anonymize_delivery_requests.sql',
  '0039_customer_preferred_delivery_date.sql',
  '0040_order_delivered_at.sql',
  '0042_customer_messages.sql',
  '0044_reusable_address_visibility.sql',
  '0045_descriptive_home_promotion_alt_text.sql',
  '0046_store_first_fulfilment.sql',
  '0047_store_inventory_reservation_floor.sql',
  '0048_store_catalogue_pricing.sql',
  '0051_waternow_supplier_network.sql',
  '0052_waternow_catalogue_seed.sql'
];

const requiredTriggers=[
  'delivery_slot_capacity_before_insert',
  'delivery_slot_capacity_before_update',
  'delivery_store_stock_before_insert',
  'delivery_store_stock_before_update',
  'delivery_store_inventory_stock_floor_before_update',
  'delivery_order_store_active_before_insert',
  'delivery_order_store_active_before_update',
  'delivery_store_active_before_insert',
  'delivery_store_active_before_update'
];

// Account-erasure safety contract: order_address_snapshots.customer_id must allow NULL for account erasure.
function tableSource(name){
  const match=schema.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+'\\s*\\(([\\s\\S]*?)\\);'));
  return match?.[1]||'';
}
function run(){
  const problems=[];
  for(const [table,columns] of Object.entries(required)){
    const source=tableSource(table);
    if(!source){problems.push('Missing table '+table);continue}
    for(const column of columns){
      if(!new RegExp('(?:^|[,(\\n])\\s*'+column+'\\s+').test(source))problems.push('Missing column '+table+'.'+column);
    }
  }
  for(const index of requiredIndexes){
    if(!schema.includes(index))problems.push('Missing index '+index);
  }
  for(const trigger of requiredTriggers){
    if(!schema.includes(trigger))problems.push('Missing integrity trigger '+trigger);
  }
  for(const migration of requiredMigrations){
    if(!existsSync(resolve(root,'migrations',migration)))problems.push('Missing migration '+migration);
  }
  if(!schema.includes('customer_id TEXT,')||!schema.includes('FOREIGN KEY(address_id) REFERENCES addresses(id) ON DELETE SET NULL')){
    problems.push('order_address_snapshots.customer_id must allow NULL for account erasure while retaining address integrity');
  }
  if(problems.length){
    console.error('Local schema audit failed:\\n- '+problems.join('\\n- '));
    process.exitCode=1;
    return {ok:false,problems};
  }
  console.log('Local schema audit passed: '+Object.keys(required).length+' tables, '+requiredIndexes.length+' indexes, '+requiredTriggers.length+' integrity triggers, '+requiredMigrations.length+' migration files.');
  return {ok:true,problems:[]};
}

export { required, requiredIndexes, requiredMigrations, requiredTriggers, tableSource, run };
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)run();
