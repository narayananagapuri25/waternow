-- Idempotent WaterNow catalogue activation for fresh-schema installs and existing D1 databases.
-- Supplier-specific prices and stock are still managed by the owner; zero-priced packs cannot be ordered.
UPDATE categories SET active=0,updated_at=CURRENT_TIMESTAMP;
UPDATE products SET active=0,updated_at=CURRENT_TIMESTAMP;
INSERT OR IGNORE INTO categories (id,name,slug,icon,description,display_order,active) VALUES
  ('water-20l','20L Water Can','20l-water-can','💧','Reusable 20-litre drinking water can for home and office delivery.',1,1),
  ('water-10l-pair','2 × 10L Water Cans','two-10l-water-cans','🚰','Convenient pack containing two 10-litre drinking water cans.',2,1);
UPDATE categories SET name='20L Water Can',slug='20l-water-can',icon='💧',
  description='Reusable 20-litre drinking water can for home and office delivery.',display_order=1,active=1,
  updated_at=CURRENT_TIMESTAMP WHERE id='water-20l';
UPDATE categories SET name='2 × 10L Water Cans',slug='two-10l-water-cans',icon='🚰',
  description='Convenient pack containing two 10-litre drinking water cans.',display_order=2,active=1,
  updated_at=CURRENT_TIMESTAMP WHERE id='water-10l-pair';
INSERT OR IGNORE INTO products
  (id,name,unit,price,emoji,active,category_id,display_order,stock_managed,stock_quantity)
VALUES
  ('water-20l','20L Drinking Water Can','can',0,'💧',1,'water-20l',1,1,0),
  ('water-10l-pair','2 × 10L Drinking Water Cans','pack',0,'🚰',1,'water-10l-pair',2,1,0);
UPDATE products SET name='20L Drinking Water Can',unit='can',emoji='💧',active=1,category_id='water-20l',
  display_order=1,stock_managed=1,updated_at=CURRENT_TIMESTAMP WHERE id='water-20l';
UPDATE products SET name='2 × 10L Drinking Water Cans',unit='pack',emoji='🚰',active=1,category_id='water-10l-pair',
  display_order=2,stock_managed=1,updated_at=CURRENT_TIMESTAMP WHERE id='water-10l-pair';
