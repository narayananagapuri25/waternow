-- WaterNow sells directly from its own store catalogue; no supplier linkage is required.
-- Keep the two approved WaterNow pack prices in the central catalogue. Store-level
-- overrides remain available to the owner through the Store management screen.
UPDATE products SET price=30,updated_at=CURRENT_TIMESTAMP WHERE id='water-20l';
UPDATE products SET price=20,updated_at=CURRENT_TIMESTAMP WHERE id='water-10l-pair';
