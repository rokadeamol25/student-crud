-- Optional internal reference number for rough bill / estimate.
-- Simple text field, no constraints or relationships.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS rough_bill_ref TEXT;

COMMENT ON COLUMN invoices.rough_bill_ref IS 'Optional internal reference for rough bill / estimate; not shown on customer-facing documents.';

