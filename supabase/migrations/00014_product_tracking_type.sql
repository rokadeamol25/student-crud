-- Add tracking_type, sku, is_active to products table.
-- All existing products default to 'quantity' tracking (no disruption).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tracking_type TEXT NOT NULL DEFAULT 'quantity',
  ADD COLUMN IF NOT EXISTS sku           TEXT,
  ADD COLUMN IF NOT EXISTS is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ;

ALTER TABLE products
  ADD CONSTRAINT products_tracking_type_check
    CHECK (tracking_type IN ('quantity', 'serial', 'batch'));

-- Partial unique index on SKU (only when not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_tenant_sku
  ON products (tenant_id, sku) WHERE sku IS NOT NULL;

COMMENT ON COLUMN products.tracking_type IS 'How inventory is tracked: quantity, serial, or batch';
COMMENT ON COLUMN products.sku           IS 'Optional SKU or barcode';
COMMENT ON COLUMN products.is_active     IS 'Soft-delete / archive flag';
