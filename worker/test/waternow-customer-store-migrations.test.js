import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const m55 = read('../migrations/0055_waternow_legacy_10l_pack.sql');
const m56 = read('../migrations/0056_waternow_boduppal_store.sql');
const m57 = read('../migrations/0057_waternow_store_inventory_source.sql');

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
    INSERT INTO categories(id,name,slug,icon,description,display_order,active) VALUES('water-20l','20L Water Can','20l-water-can','💧','20 litre can',1,1);
    INSERT INTO products(id,name,unit,price,emoji,active,category_id,display_order,stock_managed,stock_quantity) VALUES
      ('water-20l','20L Drinking Water Can','bottle',30,'💧',1,'water-20l',1,1,999),
      ('p-mw99d1uv-vx6mg','10L Drinking water can','bottle',20,'💧',1,'water-20l',2,1,999);
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
    const products = db.prepare("SELECT p.name,p.unit,p.price,c.is_available,COALESCE(i.stock_quantity,0) stock FROM delivery_store_catalogue c JOIN products p ON p.id=c.product_id LEFT JOIN delivery_store_inventory i ON i.store_id=c.store_id AND i.product_id=p.id WHERE c.store_id=? ORDER BY p.display_order").all(store.id);
    assert.equal(products.length, 2);
    assert.equal(products[0].price, 30);
    assert.equal(products[1].name, '2 × 10L Drinking Water Cans');
    assert.equal(products[1].unit, 'pack');
    assert.equal(products[1].price, 20);
    assert.ok(products.every(p => p.is_available === 1 && p.stock === 0));
    const central = db.prepare('SELECT SUM(stock_quantity) quantity FROM products').get();
    assert.equal(central.quantity, 1998, 'the existing central catalogue quantities must remain unchanged');
    db.exec(m56);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM delivery_stores').get().count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM delivery_store_catalogue').get().count, 2);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM delivery_store_inventory').get().count, 2);
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
