-- WaterNow stock is tracked only at the fulfilment-store level.
-- Keep the legacy product quantity at zero so it cannot be mistaken for available stock.
UPDATE products
SET stock_quantity=0,updated_at=CURRENT_TIMESTAMP
WHERE stock_managed=1;

-- Supplier-product rows may retain offer pricing, but their old stock column is
-- deprecated and must not be copied into or used instead of store inventory.
UPDATE water_supplier_products SET stock_quantity=0;

-- The Owner's Active/Inactive selection is the complete store-status decision.
-- Activate the requested Boduppal store; actual store stock remains zero until entered.
UPDATE delivery_stores
SET is_active=1,updated_at=CURRENT_TIMESTAMP
WHERE id='waternow-boduppal';
