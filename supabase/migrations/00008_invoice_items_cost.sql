-- COGS: snapshot cost per unit and line cost on invoice items (at sale time)
-- Run after 00007_suppliers_and_purchases.sql

ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  ADD COLUMN IF NOT EXISTS cost_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost_amount >= 0);

COMMENT ON COLUMN invoice_items.cost_price IS 'Cost per unit at sale time (from product.last_purchase_price)';
COMMENT ON COLUMN invoice_items.cost_amount IS 'Line cost: quantity × cost_price at sale time';
