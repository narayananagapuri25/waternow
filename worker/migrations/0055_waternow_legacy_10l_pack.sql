-- Separate WaterNow's two-10L-can pack from the 20L single-can category.
-- Preserve the existing production product ID because historic order_items reference it.
INSERT OR IGNORE INTO categories
  (id,name,slug,icon,description,display_order,active)
VALUES
  ('water-10l-pair','2 × 10L Water Cans','two-10l-water-cans','🚰',
   'Pack containing two 10-litre drinking water cans.',2,1);

UPDATE categories
SET name='2 × 10L Water Cans',slug='two-10l-water-cans',icon='🚰',
    description='Pack containing two 10-litre drinking water cans.',
    display_order=2,active=1,updated_at=CURRENT_TIMESTAMP
WHERE id='water-10l-pair';

UPDATE products
SET name='2 × 10L Drinking Water Cans',unit='pack',price=20,emoji='🚰',
    active=1,category_id='water-10l-pair',display_order=2,stock_managed=1,
    updated_at=CURRENT_TIMESTAMP
WHERE id='water-10l-pair';

UPDATE products
SET name='2 × 10L Drinking Water Cans',unit='pack',price=20,emoji='🚰',
    active=1,category_id='water-10l-pair',display_order=2,stock_managed=1,
    updated_at=CURRENT_TIMESTAMP
WHERE id='p-mw99d1uv-vx6mg'
  AND lower(trim(name))='10l drinking water can'
  AND price=20;
