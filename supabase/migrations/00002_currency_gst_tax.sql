-- Currency, GST/tax per tenant; tax on invoices
-- Run after 00001_initial_schema.sql

-- Tenants: currency (code/symbol), GSTIN, tax %
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS currency_symbol TEXT,
  ADD COLUMN IF NOT EXISTS gstin TEXT,
  ADD COLUMN IF NOT EXISTS tax_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_percent >= 0 AND tax_percent <= 100);

COMMENT ON COLUMN tenants.currency IS 'ISO currency code e.g. INR, USD';
COMMENT ON COLUMN tenants.currency_symbol IS 'Display symbol e.g. ₹, $; null = derive from currency';
COMMENT ON COLUMN tenants.gstin IS 'GST Identification Number (India)';
COMMENT ON COLUMN tenants.tax_percent IS 'Default tax % applied to invoice subtotal';

-- Invoices: tax amount (subtotal + tax_amount = total)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS tax_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0);

COMMENT ON COLUMN invoices.tax_percent IS 'Tax % at time of invoice (snapshot from tenant)';
COMMENT ON COLUMN invoices.tax_amount IS 'Tax amount (subtotal * tax_percent / 100)';
