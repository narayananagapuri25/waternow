-- WaterNow catalogue contains one 20L can and one 10L can (not a two-can 10L pack).
-- Keep the historic 10L product ID where it exists so old order-item foreign keys remain valid.
-- Never rewrite prices, store price overrides, physical inventory or order snapshots.

INSERT OR IGNORE INTO categories
  (id,name,slug,icon,description,display_order,active)
VALUES
  ('water-10l-can','10L Water Can','10l-water-can','🚰',
   'Single reusable 10-litre drinking water can.',2,1);

UPDATE categories
SET name='10L Water Can',slug='10l-water-can',icon='🚰',
    description='Single reusable 10-litre drinking water can.',
    display_order=2,active=1,updated_at=CURRENT_TIMESTAMP
WHERE id='water-10l-can';

-- Existing production databases retain this legacy product ID because historic orders reference it.
UPDATE products
SET name='10L Drinking Water Can',unit='can',active=1,category_id='water-10l-can',
    display_order=2,stock_managed=1,updated_at=CURRENT_TIMESTAMP
WHERE id='p-mw99d1uv-vx6mg';

-- Fresh installs may not contain the legacy ID. In that case, convert the seeded
-- 10L catalogue row in place while retaining its existing price and product ID.
UPDATE products
SET name='10L Drinking Water Can',unit='can',active=1,category_id='water-10l-can',
    display_order=2,stock_managed=1,updated_at=CURRENT_TIMESTAMP
WHERE id='water-10l-pair'
  AND NOT EXISTS (SELECT 1 FROM products WHERE id='p-mw99d1uv-vx6mg');

-- When the historic row exists, hide the duplicate seeded two-can pack without deleting it.
UPDATE products
SET active=0,updated_at=CURRENT_TIMESTAMP
WHERE id='water-10l-pair'
  AND EXISTS (SELECT 1 FROM products WHERE id='p-mw99d1uv-vx6mg');

UPDATE categories
SET active=0,updated_at=CURRENT_TIMESTAMP
WHERE id='water-10l-pair';

-- Ensure each store has catalogue/inventory rows for the one active 10L can.
-- OR IGNORE preserves any existing store-level availability, price override and physical quantity.
INSERT OR IGNORE INTO delivery_store_catalogue (store_id,product_id,is_available,price_override)
SELECT s.id,p.id,1,NULL
FROM delivery_stores s
JOIN products p ON p.id IN ('p-mw99d1uv-vx6mg','water-10l-pair') AND p.active=1;

INSERT OR IGNORE INTO delivery_store_inventory (store_id,product_id,stock_quantity)
SELECT s.id,p.id,0
FROM delivery_stores s
JOIN products p ON p.id IN ('p-mw99d1uv-vx6mg','water-10l-pair') AND p.active=1 AND p.stock_managed=1;
