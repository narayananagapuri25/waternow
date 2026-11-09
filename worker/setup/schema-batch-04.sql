-- WaterNow production D1 schema — batch 4 of 4
-- Run after schema-batch-03.sql.
-- Safe to rerun: statements use IF NOT EXISTS / INSERT OR IGNORE.

-- WaterNow supplier network (the migration 0045 adds the same records to an existing D1 database).
CREATE TABLE IF NOT EXISTS water_suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  supplier_type TEXT NOT NULL CHECK(supplier_type IN ('producer','distributor','retailer')),
  contact_person TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT '',
  pincode TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  latitude REAL,
  longitude REAL,
  service_radius_km REAL NOT NULL DEFAULT 5 CHECK(service_radius_km BETWEEN 0.1 AND 100),
  fulfilment_model TEXT NOT NULL DEFAULT 'supplier_delivery' CHECK(fulfilment_model IN ('supplier_delivery','platform_delivery')),
  fssai_license_number TEXT NOT NULL DEFAULT '',
  fssai_license_expiry TEXT,
  water_testing_scheme_acknowledged INTEGER NOT NULL DEFAULT 0 CHECK(water_testing_scheme_acknowledged IN (0,1)),
  compliance_status TEXT NOT NULL DEFAULT 'pending' CHECK(compliance_status IN ('pending','under_review','verified','suspended')),
  compliance_note TEXT NOT NULL DEFAULT '',
  verified_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS water_supplier_service_areas (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES water_suppliers(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT '',
  pincode TEXT NOT NULL DEFAULT '',
  radius_km REAL NOT NULL DEFAULT 5 CHECK(radius_km BETWEEN 0.1 AND 100),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(supplier_id,city,pincode)
);
CREATE TABLE IF NOT EXISTS water_supplier_products (
  supplier_id TEXT NOT NULL REFERENCES water_suppliers(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  supplier_sku TEXT NOT NULL DEFAULT '',
  selling_price INTEGER NOT NULL DEFAULT 0 CHECK(selling_price >= 0),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK(stock_quantity >= 0),
  is_available INTEGER NOT NULL DEFAULT 0 CHECK(is_available IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(supplier_id,product_id)
);
CREATE TABLE IF NOT EXISTS water_delivery_partners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  partner_type TEXT NOT NULL CHECK(partner_type IN ('individual','fleet','supplier_staff')),
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT '',
  pincode TEXT NOT NULL DEFAULT '',
  vehicle_type TEXT NOT NULL DEFAULT '',
  compliance_status TEXT NOT NULL DEFAULT 'pending' CHECK(compliance_status IN ('pending','verified','suspended')),
  is_active INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0,1)),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS water_delivery_partner_service_areas (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES water_delivery_partners(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT '',
  pincode TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(partner_id,city,pincode)
);
CREATE TABLE IF NOT EXISTS water_order_fulfilments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  supplier_id TEXT NOT NULL REFERENCES water_suppliers(id) ON DELETE RESTRICT,
  delivery_partner_id TEXT REFERENCES water_delivery_partners(id) ON DELETE RESTRICT,
  fulfilment_model TEXT NOT NULL CHECK(fulfilment_model IN ('supplier_delivery','platform_delivery')),
  status TEXT NOT NULL DEFAULT 'assigned' CHECK(status IN ('assigned','accepted','preparing','out_for_delivery','delivered','cancelled','failed')),
  supplier_order_reference TEXT NOT NULL DEFAULT '',
  delivery_tracking_reference TEXT NOT NULL DEFAULT '',
  proof_of_delivery_url TEXT NOT NULL DEFAULT '',
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TEXT,
  dispatched_at TEXT,
  delivered_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(order_id)
);
CREATE INDEX IF NOT EXISTS idx_water_suppliers_city_status ON water_suppliers(city,is_active,compliance_status);
CREATE INDEX IF NOT EXISTS idx_water_supplier_areas_lookup ON water_supplier_service_areas(city,pincode,is_active);
CREATE INDEX IF NOT EXISTS idx_water_supplier_products_available ON water_supplier_products(product_id,is_available,selling_price);
CREATE INDEX IF NOT EXISTS idx_water_delivery_partners_city_status ON water_delivery_partners(city,is_active,compliance_status);
CREATE INDEX IF NOT EXISTS idx_water_fulfilments_supplier_status ON water_order_fulfilments(supplier_id,status,assigned_at DESC);

INSERT OR IGNORE INTO store_profile (id,store_name,share_title,share_description) VALUES
  (1,'WaterNow','WaterNow | Drinking Water Delivered Locally','Order 20L drinking water cans or packs of two 10L cans from local suppliers with convenient home delivery.');
UPDATE store_profile SET store_name='WaterNow',share_title='WaterNow | Drinking Water Delivered Locally',
  share_description='Order 20L drinking water cans or packs of two 10L cans from local suppliers with convenient home delivery.' WHERE id=1;
