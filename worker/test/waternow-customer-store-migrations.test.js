import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const m55 = read('../migrations/0055_waternow_legacy_10l_pack.sql');
const m56 = read('../migrations/0056_waternow_boduppal_store.sql');
const m57 = read('../migrations/0057_waternow_store_inventory_source.sql');
const m58 = read('../migrations/0058_waternow_single_10l_can.sql');
const m59 = read('../migrations/0059_waternow_normalize_20l_can.sql');

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON;');
  db.exec(`
    CREATE TABLE categories(id TEXT PRIMARY KEY,name TEXT NOT NULL,slug TEXT NOT NULL,icon TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '',display_order INTEGER NOT NULL DEFAULT 999,active INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE products(id TEXT PRIMARY KEY,name TEXT NOT NULL,unit TEXT NOT NULL,price INTEGER NOT NULL,emoji TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,category_id TEXT NOT NULL REFERENCES categories(id),display_order INTEGER NOT NULL DEFAULT 999,stock_managed INTEGER NOT NULL DEFAULT 0,stock_quantity INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE orders(id TEXT PRIMARY KEY);
    CREATE TABLE order_items(id INTEGER PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),product_id TEXT NOT NULL REFERENCES products(id),name TEXT NOT NULL,unit TEXT NOT NULL,qty INTEGER NOT NULL,price INTEGER NOT NULL,line_total INTEGER NOT NULL);
    CREATE TABLE delivery_stores(id TEXT PRIMARY KEY,name TEXT NOT NULL,address TEXT NOT NULL DEFAULT '',latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),service_radius_km REAL NOT NULL DEFAULT 10 CHECK(service_radius_km BETWEEN 0.1 AND 100),is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),delivery_model TEXT NOT NULL DEFAULT 'owner_managed',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE delivery_store_catalogue(store_id TEXT NOT NULL REFERENCES delivery_stores(id),product_id TEXT NOT NULL REFERENCES products(id),is_available INTEGER NOT NULL DEFAULT 1,price_override INTEGER,PRIMARY KEY(store_id,product_id));
    CREATE TABLE delivery_store_inventory(store_id TEXT NOT NULL REFERENCES delivery_stores(id),product_id TEXT NOT NULL REFERENCES products(id),stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK(stock_quantity>=0),PRIMARY KEY(store_id,product_id));
    CREATE TABLE water_supplier_products(supplier_id TEXT NOT NULL,product_id TEXT NOT NULL,stock_quantity INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE store_profile(id INTEGER PRIMARY KEY,share_description TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO store_profile(id,share_description) VALUES(1,'Order 20L drinking water cans or packs of two 10L cans from local suppliers with convenient home delivery.');
    INSERT INTO categories(id,name,slug,icon,description,display_order,active) VALUES('water-20l','20L Water Can','20l-water-can','💧','20 litre can',1,1);
    INSERT INTO categories(id,name,slug,icon,description,display_order,active) VALUES('water-10l-pair','2 × 10L Water Cans','two-10l-water-cans','🚰','Two 10 litre cans',2,1);
    INSERT INTO products(id,name,unit,price,emoji,active,category_id,display_order,stock_managed,stock_quantity) VALUES
      ('water-20l','20L Drinking Water Can','can',30,'💧',1,'water-20l',1,1,999),
      ('water-10l-pair','2 × 10L Drinking Water Cans','pack',20,'🚰',1,'water-10l-pair',2,1,0),
      ('p-mw99d1uv-vx6mg','10L Drinking water can','bottle',20,'💧',1,'water-20l',3,1,999);
    INSERT INTO orders(id) VALUES('historic-order');
    INSERT INTO water_supplier_products(supplier_id,product_id,stock_quantity) VALUES('supplier-legacy','water-20l',17);
    INSERT INTO order_items(order_id,product_id,name,unit,qty,price,line_total) VALUES('historic-order','p-mw99d1uv-vx6mg','10L Drinking water can','bottle',2,20,40);
  `);
  return db;
}

test('0055 keeps legacy product references and order snapshots while correcting the two-10L pack', () => {
  const db = database();
  try {
    db.exec(m55);
    const product = db.prepare("SELECT * FROM products WHERE id='p-mw99d1uv-vx6mg'").get();
    assert.equal(product.name, '2 × 10L Drinking Water Cans');
    assert.equal(product.unit, 'pack');
    assert.equal(product.price, 20);
    assert.equal(product.category_id, 'water-10l-pair');
    assert.equal(product.stock_quantity, 999);
    const history = db.prepare("SELECT * FROM order_items WHERE order_id='historic-order'").get();
    assert.equal(history.product_id, 'p-mw99d1uv-vx6mg');
    assert.equal(history.name, '10L Drinking water can');
    assert.equal(history.price, 20);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
});

test('0056 creates an inactive Boduppal placeholder and never invents store inventory', () => {
  const db = database();
  try {
    db.exec(m55);
    db.exec(m56);
    const store = db.prepare("SELECT * FROM delivery_stores WHERE id='waternow-boduppal'").get();
    assert.ok(store);
    assert.equal(store.name, 'WaterNow Boduppal');
    assert.match(store.address, /Brindavan Colony/);
    assert.match(store.address, /approximate locality pin/i);
    assert.equal(store.latitude, 17.415);
    assert.equal(store.longitude, 78.585);
    assert.equal(store.service_radius_km, 5);
    assert.equal(store.is_active, 0, 'the store must remain inactive until the Owner verifies the location and stock');
    assert.equal(store.delivery_model, 'owner_managed');
    const products = db.prepare("SELECT p.id,p.name,p.unit,p.price,c.is_available,COALESCE(i.stock_quantity,0) stock FROM delivery_store_catalogue c JOIN products p ON p.id=c.product_id LEFT JOIN delivery_store_inventory i ON i.store_id=c.store_id AND i.product_id=p.id WHERE c.store_id=? ORDER BY p.display_order").all(store.id);
    assert.equal(products.length, 3, 'the legacy single-can row and seeded pack row are both present before migration 0058');
    assert.ok(products.some(p => p.id === 'water-20l' && p.name === '20L Drinking Water Can' && p.unit === 'can' && p.price === 30));
    assert.ok(products.some(p => p.id === 'water-10l-pair' && p.name === '2 × 10L Drinking Water Cans' && p.unit === 'pack' && p.price === 20));
    assert.ok(products.some(p => p.id === 'p-mw99d1uv-vx6mg' && p.name === '2 × 10L Drinking Water Cans' && p.unit === 'pack' && p.price === 20));
    assert.ok(products.every(p => p.is_available === 1 && p.stock === 0));
    const central = db.prepare('SELECT SUM(stock_quantity) quantity FROM products').get();
    assert.equal(central.quantity, 1998, 'the existing central catalogue quantities must remain unchanged');
    db.exec(m56);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM delivery_stores').get().count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM delivery_store_catalogue').get().count, 3);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM delivery_store_inventory').get().count, 3);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
});


test('0057 activates Boduppal directly and clears the obsolete global stock quantity', () => {
  const db = database();
  try {
    db.exec(m55);
    db.exec(m56);
    db.exec(m57);
    const store = db.prepare("SELECT is_active FROM delivery_stores WHERE id='waternow-boduppal'").get();
    assert.equal(store.is_active,1,'the store status must follow the explicit activation migration');
    const global = db.prepare('SELECT SUM(stock_quantity) quantity FROM products').get();
    assert.equal(global.quantity,0,'the legacy central quantity is no longer a stock source');
    const local = db.prepare("SELECT SUM(stock_quantity) quantity FROM delivery_store_inventory WHERE store_id='waternow-boduppal'").get();
    assert.equal(local.quantity,0,'activation must not invent physical store stock');
    assert.equal(db.prepare('SELECT SUM(stock_quantity) quantity FROM water_supplier_products').get().quantity,0,'supplier stock column is deprecated and cleared');
    db.exec(m57);
    assert.equal(db.prepare("SELECT is_active FROM delivery_stores WHERE id='waternow-boduppal'").get().is_active,1);
    assert.equal(db.prepare('SELECT SUM(stock_quantity) quantity FROM products').get().quantity,0);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally { db.close(); }
});



test('0059 normalizes the live 20L unit to can without changing prices, availability, stock or history', () => {
  const db = database();
  try {
    db.exec(m55);
    db.exec(m56);
    db.exec(m57);
    db.exec(m58);

    // Reproduce the actual production mismatch discovered by the read-only D1 diagnostic.
    db.prepare("UPDATE products SET unit='bottle' WHERE id='water-20l'").run();
    db.prepare("UPDATE categories SET name='20L Water Cans' WHERE id='water-20l'").run();
    db.prepare("UPDATE delivery_store_catalogue SET is_available=0,price_override=37 WHERE store_id='waternow-boduppal' AND product_id='water-20l'").run();
    db.prepare("UPDATE delivery_store_inventory SET stock_quantity=14 WHERE store_id='waternow-boduppal' AND product_id='water-20l'").run();
    db.prepare("INSERT INTO order_items(order_id,product_id,name,unit,qty,price,line_total) VALUES('historic-order','water-20l','Historic 20L bottle','bottle',1,30,30)").run();

    const before = db.prepare("SELECT price,stock_quantity,active FROM products WHERE id='water-20l'").get();
    db.exec(m59);

    const product = db.prepare("SELECT id,name,unit,price,stock_quantity,active,category_id FROM products WHERE id='water-20l'").get();
    assert.equal(product.name,'20L Drinking Water Can');
    assert.equal(product.unit,'can');
    assert.equal(product.category_id,'water-20l');
    assert.equal(product.price,before.price,'the central 20L price must not change');
    assert.equal(product.stock_quantity,before.stock_quantity,'the deprecated global stock quantity must not change');
    assert.equal(product.active,before.active,'the migration must not override the Owner visibility setting');

    const category = db.prepare("SELECT name,slug,active FROM categories WHERE id='water-20l'").get();
    assert.equal(category.name,'20L Water Can');
    assert.equal(category.slug,'20l-water-can');
    assert.equal(category.active,1);
    assert.equal(db.prepare('SELECT share_description FROM store_profile WHERE id=1').get().share_description,'Order 20L and 10L drinking water cans directly from WaterNow with convenient home delivery.','known old share copy is corrected');

    const storeCatalogue = db.prepare("SELECT is_available,price_override FROM delivery_store_catalogue WHERE store_id='waternow-boduppal' AND product_id='water-20l'").get();
    assert.equal(storeCatalogue.is_available,0,'existing per-store availability is preserved');
    assert.equal(storeCatalogue.price_override,37,'existing per-store price override is preserved');
    assert.equal(db.prepare("SELECT stock_quantity FROM delivery_store_inventory WHERE store_id='waternow-boduppal' AND product_id='water-20l'").get().stock_quantity,14,'physical store stock is preserved');

    const history = db.prepare("SELECT name,unit,price,qty,line_total FROM order_items WHERE order_id='historic-order' AND product_id='water-20l'").get();
    assert.equal(history.name,'Historic 20L bottle');
    assert.equal(history.unit,'bottle');
    assert.equal(history.price,30);
    assert.equal(history.qty,1);
    assert.equal(history.line_total,30);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);

    db.prepare("UPDATE store_profile SET share_description='Owner custom description' WHERE id=1").run();
    db.exec(m59);
    const after = db.prepare("SELECT price,unit FROM products WHERE id='water-20l'").get();
    assert.equal(after.price,before.price,'migration 0059 is idempotent and never rewrites prices');
    assert.equal(after.unit,'can');
    assert.equal(db.prepare("SELECT COUNT(*) count FROM products WHERE active=1").get().count,2);
    assert.equal(db.prepare('SELECT share_description FROM store_profile WHERE id=1').get().share_description,'Owner custom description','owner-edited share copy is preserved');
  } finally { db.close(); }
});

test('0058 keeps one 10L can and the 20L can while preserving prices, stock, store overrides and order history', () => {
  const db = database();
  try {
    db.exec(m55);
    db.exec(m56);
    db.exec(m57);
    db.prepare("UPDATE delivery_store_catalogue SET price_override=23 WHERE store_id='waternow-boduppal' AND product_id='p-mw99d1uv-vx6mg'").run();
    db.prepare("UPDATE delivery_store_inventory SET stock_quantity=17 WHERE store_id='waternow-boduppal' AND product_id='p-mw99d1uv-vx6mg'").run();

    const tenBefore = db.prepare("SELECT price FROM products WHERE id='p-mw99d1uv-vx6mg'").get().price;
    const twentyBefore = db.prepare("SELECT price FROM products WHERE id='water-20l'").get().price;
    db.exec(m58);

    const active = db.prepare("SELECT id,name,unit,price,category_id FROM products WHERE active=1 ORDER BY display_order,id").all();
    assert.equal(active.length,2,'only one 10L product and one 20L product are active');
    assert.ok(active.some(p=>p.id==='water-20l'&&/20L/i.test(p.name)&&p.unit==='can'));
    const ten=active.find(p=>/10L/i.test(p.name));
    assert.ok(ten,'one 10L can remains in the customer catalogue');
    assert.equal(ten.unit,'can');
    assert.doesNotMatch(ten.name,/two|2\\s*[x×]|pair|pack/i,'10L must be one can, not a two-can pack');
    assert.equal(ten.id,'p-mw99d1uv-vx6mg','the historic product ID is retained');
    assert.equal(ten.price,tenBefore,'the saved 10L price is not rewritten');
    assert.equal(db.prepare("SELECT price FROM products WHERE id='water-20l'").get().price,twentyBefore,'the saved 20L price is not rewritten');
    assert.equal(db.prepare("SELECT active FROM products WHERE id='water-10l-pair'").get().active,0,'the duplicate seeded two-can pack is hidden without deleting its history');
    assert.equal(db.prepare("SELECT active FROM categories WHERE id='water-10l-pair'").get().active,0);
    assert.equal(db.prepare("SELECT price_override FROM delivery_store_catalogue WHERE store_id='waternow-boduppal' AND product_id='p-mw99d1uv-vx6mg'").get().price_override,23,'the store price override is preserved');
    assert.equal(db.prepare("SELECT stock_quantity FROM delivery_store_inventory WHERE store_id='waternow-boduppal' AND product_id='p-mw99d1uv-vx6mg'").get().stock_quantity,17,'physical store stock is preserved');
    const history=db.prepare("SELECT product_id,name,unit,price,qty,line_total FROM order_items WHERE order_id='historic-order'").get();
    assert.equal(history.product_id,'p-mw99d1uv-vx6mg');
    assert.equal(history.name,'10L Drinking water can');
    assert.equal(history.unit,'bottle');
    assert.equal(history.price,20);
    assert.equal(history.qty,2);
    assert.equal(history.line_total,40);
    assert.equal(db.prepare('SELECT is_active FROM delivery_stores WHERE id=?').get('waternow-boduppal').is_active,1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    db.exec(m58);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM products WHERE active=1").get().count,2,'migration 0058 is idempotent');
  } finally { db.close(); }
});
