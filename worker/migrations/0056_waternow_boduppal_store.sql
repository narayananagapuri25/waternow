-- Create a disabled WaterNow Boduppal location placeholder only when no store exists.
-- Coordinates are an approximate locality-centre map pin, not a verified shop/property GPS.
-- The store stays inactive and has zero store stock until the Owner confirms the exact map pin,
-- radius and physical inventory in the Owner app.
INSERT OR IGNORE INTO delivery_stores
  (id,name,address,latitude,longitude,service_radius_km,is_active,delivery_model)
SELECT 'waternow-boduppal','WaterNow Boduppal',
       'Brindavan Colony, Boduppal, Telangana 500092 — approximate locality pin; confirm exact shop location in Owner app',
       17.415,78.585,5,0,'owner_managed'
WHERE NOT EXISTS (SELECT 1 FROM delivery_stores);

INSERT OR IGNORE INTO delivery_store_catalogue
  (store_id,product_id,is_available,price_override)
SELECT s.id,p.id,1,NULL FROM delivery_stores s CROSS JOIN products p
WHERE s.id='waternow-boduppal' AND p.active=1;

-- Do not copy central/demo stock quantities into a physical store. The Owner must
-- enter verified on-hand quantities before activating the store.
INSERT OR IGNORE INTO delivery_store_inventory (store_id,product_id,stock_quantity)
SELECT s.id,p.id,0
FROM delivery_stores s CROSS JOIN products p
WHERE s.id='waternow-boduppal' AND p.active=1 AND p.stock_managed=1;
