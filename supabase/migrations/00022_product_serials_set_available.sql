-- Set status of all product serials to 'available'
-- Use this to reset sold/returned/damaged serials back to available if needed.

UPDATE product_serials
SET status = 'available'
WHERE status IS DISTINCT FROM 'available';

-- Optional: sync product stock to match count of available serials (for serial-tracked products)
UPDATE products p
SET stock = COALESCE(
  (SELECT COUNT(*)::numeric
   FROM product_serials ps
   WHERE ps.product_id = p.id
     AND ps.tenant_id = p.tenant_id
     AND ps.status = 'available'),
  0
)
WHERE p.tracking_type = 'serial';
