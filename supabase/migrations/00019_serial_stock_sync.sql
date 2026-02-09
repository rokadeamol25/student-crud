-- ============================================================
-- Fix: For serial-tracked products, stock must equal the count
-- of available serials. This corrects any double-count (e.g. from
-- seed script adding quantity on top of existing serial count).
-- Safe to run multiple times.
-- ============================================================

UPDATE products p
SET stock = COALESCE((
  SELECT COUNT(*)::numeric
  FROM product_serials ps
  WHERE ps.product_id = p.id
    AND ps.tenant_id = p.tenant_id
    AND ps.status = 'available'
), 0),
updated_at = COALESCE(updated_at, now())
WHERE p.tracking_type = 'serial';
