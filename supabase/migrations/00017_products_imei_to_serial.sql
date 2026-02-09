-- ============================================================
-- Migration: Convert products with IMEI to serial tracking
-- and backfill product_serials from products.imei
--
-- Strategy:
-- 1. Set tracking_type = 'serial' for all products that have
--    a non-empty imei (they are serial/IMEI type).
-- 2. Insert one row per product into product_serials using
--    the product's imei as serial_number (tenant-scoped unique).
-- 3. Optionally set products.stock = count of available serials
--    so serial and stock stay in sync.
-- ============================================================

-- Step 1: Set tracking_type to 'serial' for products with IMEI
UPDATE products
SET tracking_type = 'serial',
    updated_at = COALESCE(updated_at, now())
WHERE tenant_id IS NOT NULL
  AND TRIM(COALESCE(imei, '')) <> '';

-- Step 2: Insert into product_serials (one serial per product from imei)
-- Skip if a serial with same (tenant_id, serial_number) already exists
INSERT INTO product_serials (
  tenant_id,
  product_id,
  serial_number,
  status,
  cost_price,
  created_at
)
SELECT
  p.tenant_id,
  p.id,
  TRIM(p.imei),
  'available',
  p.last_purchase_price,
  COALESCE(p.updated_at, p.created_at, now())
FROM products p
WHERE p.tenant_id IS NOT NULL
  AND TRIM(COALESCE(p.imei, '')) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM product_serials ps
    WHERE ps.tenant_id = p.tenant_id
      AND ps.serial_number = TRIM(p.imei)
  );

-- Step 3: Sync products.stock with count of available serials for serial-type products
UPDATE products p
SET stock = COALESCE(
  (SELECT COUNT(*)::numeric FROM product_serials ps
   WHERE ps.product_id = p.id AND ps.tenant_id = p.tenant_id AND ps.status = 'available'),
  0
),
updated_at = now()
WHERE p.tracking_type = 'serial'
  AND p.tenant_id IS NOT NULL;
