// Static schema contract manifest used by repository tests.
// Deliberately local-only: this file does not connect to Cloudflare, inspect a live D1
// database, deploy code, or read environment credentials.
export const requiredTables = {
  delivery_scheduling_settings: ['id','enabled','timezone'],
  delivery_stores: ['id','name','latitude','longitude','service_radius_km','supplier_id','delivery_partner_id','delivery_model'],
  delivery_store_inventory: ['store_id','product_id','stock_quantity'],
  delivery_slots: ['id','store_id','delivery_date','start_minute','end_minute','capacity'],
  delivery_slot_reservations: ['id','order_id','slot_id','status'],
  delivery_store_inventory_reservations: ['id','order_id','store_id','product_id','qty','status'],
  order_action_requests: ['id','order_id','customer_id','request_type','reason','status'],
  order_audit_events: ['id','order_id','actor_type','action'],
  order_operational_flags: ['order_id','flag'],
  store_profile: ['id','store_name','about','phone','whatsapp','email','address','shop_latitude','shop_longitude','business_hours','delivery_info','share_title','share_description','created_at','updated_at'],
  water_suppliers: ['id','name','supplier_type','phone','city','fssai_license_number','fssai_license_expiry','water_testing_scheme_acknowledged','compliance_status','is_active'],
  water_supplier_products: ['supplier_id','product_id','selling_price','stock_quantity','is_available'],
  water_delivery_partners: ['id','name','partner_type','phone','city','compliance_status','is_active'],
  water_order_fulfilments: ['id','order_id','supplier_id','delivery_partner_id','fulfilment_model','status']
};

export const requiredOrderColumns = [
  'scheduled_delivery_date','scheduled_slot_id','assigned_store_id',
  'scheduled_start_minute','scheduled_end_minute','schedule_status','delivered_at'
];

export const requiredMigrations = [
  '0036_anonymize_completed_deletion_requests.sql',
  '0037_order_delivery_scheduling.sql',
  '0038_anonymize_delivery_requests.sql',
  '0039_customer_preferred_delivery_date.sql',
  '0040_order_delivered_at.sql',
  '0046_store_first_fulfilment.sql',
  '0047_store_inventory_reservation_floor.sql',
  '0045_waternow_supplier_network.sql',
  '0046_waternow_catalogue_seed.sql'
];

export const requiredIndexes = [
  'idx_customers_active_phone',
  'idx_account_deletion_requests_one_active',
  'idx_account_deletion_requests_status_created',
  'idx_account_deletion_requests_customer_created',
  'idx_addresses_customer_deleted',
  'idx_water_suppliers_city_status',
  'idx_water_supplier_areas_lookup',
  'idx_water_supplier_products_available'
];

export const requiredTriggers = [
  'delivery_slot_capacity_before_insert','delivery_slot_capacity_before_update',
  'delivery_store_stock_before_insert','delivery_store_stock_before_update',
  'delivery_store_inventory_stock_floor_before_update',
  'delivery_order_store_active_before_insert','delivery_order_store_active_before_update',
  'delivery_store_active_before_insert','delivery_store_active_before_update'
];

export const requiredDataContracts = [
  'order_address_snapshots.customer_id must allow NULL for account erasure',
  '0036_anonymize_completed_deletion_requests.sql'
];
