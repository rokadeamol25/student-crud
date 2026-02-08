-- Invoice numbering control per tenant: prefix and next number
-- Run after 00002_currency_gst_tax.sql

-- Tenants: invoice prefix (e.g. INV-, 2025-INV-) and next number to use
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS invoice_prefix TEXT NOT NULL DEFAULT 'INV-',
  ADD COLUMN IF NOT EXISTS invoice_next_number INTEGER NOT NULL DEFAULT 1 CHECK (invoice_next_number >= 1);

COMMENT ON COLUMN tenants.invoice_prefix IS 'Prefix for invoice numbers e.g. INV-, 2025-INV-';
COMMENT ON COLUMN tenants.invoice_next_number IS 'Next invoice number to assign (incremented after each create)';

-- Backfill: set invoice_next_number from existing max per tenant
UPDATE tenants t
SET invoice_next_number = COALESCE(
  (SELECT MAX(
    CASE
      WHEN REGEXP_REPLACE(i.invoice_number, '[^0-9]', '', 'g') = '' THEN NULL
      ELSE REGEXP_REPLACE(i.invoice_number, '[^0-9]', '', 'g')::INTEGER
    END
  ) + 1
   FROM invoices i
   WHERE i.tenant_id = t.id),
  1
);
