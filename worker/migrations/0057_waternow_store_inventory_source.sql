-- WaterNow stock is tracked only at the fulfilment-store level.
-- Keep the legacy product quantity at zero so it cannot be mistaken for available stock.
UPDATE products
SET stock_quantity=0,updated_at=CURRENT_TIMESTAMP
WHERE stock_managed=1;

-- The Owner's Active/Inactive selection is the complete store-status decision.
-- Activate the requested Boduppal store; actual store stock remains zero until entered.
UPDATE delivery_stores
SET is_active=1,updated_at=CURRENT_TIMESTAMP
WHERE id='waternow-boduppal';
