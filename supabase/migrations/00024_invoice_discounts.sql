-- Per-line and invoice-level discounts for invoices.
-- Adds:
-- - invoice_items.discount_type, discount_value, discount_amount
-- - invoices.discount_total

ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS discount_type TEXT CHECK (discount_type IN ('flat','percent') OR discount_type IS NULL),
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);

COMMENT ON COLUMN invoice_items.discount_type IS 'Type of discount applied to this line: flat amount or percentage.';
COMMENT ON COLUMN invoice_items.discount_value IS 'Discount value: flat amount or percent depending on discount_type.';
COMMENT ON COLUMN invoice_items.discount_amount IS 'Actual discount amount applied to this line (in invoice currency).';

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS discount_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0);

COMMENT ON COLUMN invoices.discount_total IS 'Sum of discount_amount across all invoice_items for this invoice.';

