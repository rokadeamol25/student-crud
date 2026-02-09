-- Add address and phone columns to tenants table for invoice branding
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS phone   TEXT;

COMMENT ON COLUMN tenants.address IS 'Shop / business address shown on invoices';
COMMENT ON COLUMN tenants.phone   IS 'Shop / business phone shown on invoices';
