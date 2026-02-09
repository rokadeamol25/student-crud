-- Add Company, RAM/Storage, IMEI, Color columns to products
-- These are optional; visibility controlled by tenant feature_config in Settings.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS company     TEXT,
  ADD COLUMN IF NOT EXISTS ram_storage TEXT,
  ADD COLUMN IF NOT EXISTS imei        TEXT,
  ADD COLUMN IF NOT EXISTS color       TEXT;

COMMENT ON COLUMN products.company     IS 'Brand / company name (e.g. Samsung, Apple)';
COMMENT ON COLUMN products.ram_storage IS 'RAM / storage spec (e.g. 8GB/128GB)';
COMMENT ON COLUMN products.imei        IS 'IMEI number (unique per device)';
COMMENT ON COLUMN products.color       IS 'Color variant (e.g. Black, Blue)';
