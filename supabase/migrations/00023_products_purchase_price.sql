-- Add editable purchase price on product (default when adding purchase bill lines).
-- selling price = existing "price"; purchase price = new "purchase_price" or last_purchase_price or price.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(12,2) CHECK (purchase_price IS NULL OR purchase_price >= 0);

COMMENT ON COLUMN products.purchase_price IS 'Default purchase price per unit (editable). Used when adding lines to purchase bills; recording a bill still updates last_purchase_price.';

-- Backfill: where we have last_purchase_price, set purchase_price so existing behaviour is preserved
UPDATE products
SET purchase_price = last_purchase_price
WHERE last_purchase_price IS NOT NULL AND (purchase_price IS NULL OR purchase_price <> last_purchase_price);
