-- Normalize the existing 20L WaterNow catalogue record as a single can.
-- Production had the correct product and owner-set price, but the stored unit was "bottle",
-- which caused the production smoke check (and UI unit metadata) to reject the 20L can.
-- Do not rewrite the central price, stock quantity, store availability, store price override,
-- physical inventory, or historical order-item snapshots.

INSERT OR IGNORE INTO categories
  (id,name,slug,icon,description,display_order,active)
VALUES
  ('water-20l','20L Water Can','20l-water-can','💧',
   'Reusable 20-litre drinking water can for home and office delivery.',1,1);

UPDATE categories
SET name='20L Water Can',slug='20l-water-can',icon='💧',
    description='Reusable 20-litre drinking water can for home and office delivery.',
    display_order=1,active=1,updated_at=CURRENT_TIMESTAMP
WHERE id='water-20l';

-- Preserve active/hidden status and all commercial/inventory fields; normalize identity metadata only.
UPDATE products
SET name='20L Drinking Water Can',unit='can',emoji='💧',
    category_id='water-20l',display_order=1,stock_managed=1,
    updated_at=CURRENT_TIMESTAMP
WHERE id='water-20l';

-- Add missing store mappings only. Existing availability, overrides and stock are never overwritten.
INSERT OR IGNORE INTO delivery_store_catalogue (store_id,product_id,is_available,price_override)
SELECT s.id,'water-20l',1,NULL
FROM delivery_stores s
JOIN products p ON p.id='water-20l' AND p.active=1;

INSERT OR IGNORE INTO delivery_store_inventory (store_id,product_id,stock_quantity)
SELECT s.id,'water-20l',0
FROM delivery_stores s
JOIN products p ON p.id='water-20l' AND p.active=1 AND p.stock_managed=1;

-- Update only the known old WaterNow-generated share copy; preserve owner-edited descriptions.
UPDATE store_profile
SET share_description='Order 20L and 10L drinking water cans directly from WaterNow with convenient home delivery.',
    updated_at=CURRENT_TIMESTAMP
WHERE id=1
  AND share_description IN (
    'Order 20L drinking water cans or packs of two 10L cans directly from WaterNow with convenient home delivery.',
    'Order 20L drinking water cans or packs of two 10L cans from local suppliers with convenient home delivery.'
  );
