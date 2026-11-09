-- Create the first directly managed WaterNow delivery point only if none exists.
-- Pin is an approximate East Brundavan Colony locality point, not a shop/property GPS.
-- Owner can refine it using the map picker.
INSERT OR IGNORE INTO delivery_stores
  (id,name,address,latitude,longitude,service_radius_km,is_active,delivery_model)
SELECT 'waternow-boduppal','WaterNow Boduppal',
       'East Brundavan Colony, Boduppal, Telangana 500092 (approximate locality map pin)',
       17.415,78.585,5,1,'owner_managed'
WHERE NOT EXISTS (SELECT 1 FROM delivery_stores);

INSERT OR IGNORE INTO delivery_store_catalogue
  (store_id,product_id,is_available,price_override)
SELECT s.id,p.id,1,NULL FROM delivery_stores s CROSS JOIN products p
WHERE s.id='waternow-boduppal' AND p.active=1;

-- Reuse only existing centrally configured stock quantities; do not increase them.
INSERT OR IGNORE INTO delivery_store_inventory (store_id,product_id,stock_quantity)
SELECT s.id,p.id,COALESCE(p.stock_quantity,0)
FROM delivery_stores s CROSS JOIN products p
WHERE s.id='waternow-boduppal' AND p.active=1 AND p.stock_managed=1;
