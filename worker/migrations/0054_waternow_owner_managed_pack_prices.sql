-- WaterNow sells directly from its own store catalogue; no supplier linkage is required.
-- Keep the WaterNow pack prices in the central catalogue. Store-level overrides
-- remain available to the owner through the Store management screen. No supplier
-- record or supplier price feed is needed for this direct-order model.
UPDATE products SET price=30,updated_at=CURRENT_TIMESTAMP WHERE id='water-20l';
UPDATE products SET price=20,updated_at=CURRENT_TIMESTAMP WHERE id='water-10l-pair';

-- Replace inherited supplier-oriented customer copy with WaterNow's direct service description.
UPDATE store_profile SET share_description='Order 20L drinking water cans or packs of two 10L cans directly from WaterNow with convenient home delivery.'
WHERE id=1 AND lower(share_description) LIKE '%local suppliers%';
