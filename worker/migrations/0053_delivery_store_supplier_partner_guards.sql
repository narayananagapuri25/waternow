-- Restore the supplier/partner referential behavior for delivery_stores.
-- The live D1 database already has these two columns but its historical ALTER TABLE
-- path did not retain REFERENCES clauses. Triggers provide the same insert/update
-- validation and ON DELETE SET NULL behavior without rebuilding populated tables.

CREATE TRIGGER IF NOT EXISTS delivery_stores_supplier_fk_insert
BEFORE INSERT ON delivery_stores
WHEN NEW.supplier_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM water_suppliers WHERE id = NEW.supplier_id)
BEGIN
  SELECT RAISE(ABORT, 'delivery_stores_supplier_fk');
END;

CREATE TRIGGER IF NOT EXISTS delivery_stores_supplier_fk_update
BEFORE UPDATE OF supplier_id ON delivery_stores
WHEN NEW.supplier_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM water_suppliers WHERE id = NEW.supplier_id)
BEGIN
  SELECT RAISE(ABORT, 'delivery_stores_supplier_fk');
END;

CREATE TRIGGER IF NOT EXISTS delivery_stores_partner_fk_insert
BEFORE INSERT ON delivery_stores
WHEN NEW.delivery_partner_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM water_delivery_partners WHERE id = NEW.delivery_partner_id)
BEGIN
  SELECT RAISE(ABORT, 'delivery_stores_partner_fk');
END;

CREATE TRIGGER IF NOT EXISTS delivery_stores_partner_fk_update
BEFORE UPDATE OF delivery_partner_id ON delivery_stores
WHEN NEW.delivery_partner_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM water_delivery_partners WHERE id = NEW.delivery_partner_id)
BEGIN
  SELECT RAISE(ABORT, 'delivery_stores_partner_fk');
END;

CREATE TRIGGER IF NOT EXISTS water_suppliers_delivery_stores_set_null
AFTER DELETE ON water_suppliers
BEGIN
  UPDATE delivery_stores SET supplier_id = NULL WHERE supplier_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS water_suppliers_delivery_stores_id_guard
BEFORE UPDATE OF id ON water_suppliers
WHEN NEW.id <> OLD.id
  AND EXISTS (SELECT 1 FROM delivery_stores WHERE supplier_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'water_supplier_referenced_by_delivery_store');
END;

CREATE TRIGGER IF NOT EXISTS water_delivery_partners_delivery_stores_set_null
AFTER DELETE ON water_delivery_partners
BEGIN
  UPDATE delivery_stores SET delivery_partner_id = NULL WHERE delivery_partner_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS water_delivery_partners_delivery_stores_id_guard
BEFORE UPDATE OF id ON water_delivery_partners
WHEN NEW.id <> OLD.id
  AND EXISTS (SELECT 1 FROM delivery_stores WHERE delivery_partner_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'water_delivery_partner_referenced_by_delivery_store');
END;
