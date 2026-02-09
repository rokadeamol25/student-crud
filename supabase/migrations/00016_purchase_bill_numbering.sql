-- Purchase bill numbering per tenant (like invoice numbering)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS purchase_bill_prefix      TEXT NOT NULL DEFAULT 'PB-',
  ADD COLUMN IF NOT EXISTS purchase_bill_next_number INTEGER NOT NULL DEFAULT 1 CHECK (purchase_bill_next_number >= 1);

COMMENT ON COLUMN tenants.purchase_bill_prefix      IS 'Prefix for purchase bill numbers e.g. PB-, PO-';
COMMENT ON COLUMN tenants.purchase_bill_next_number IS 'Next purchase bill number to assign (incremented after each create)';

-- Backfill from existing max per tenant
UPDATE tenants t
SET purchase_bill_next_number = COALESCE(
  (SELECT MAX(
    CASE
      WHEN REGEXP_REPLACE(b.bill_number, '[^0-9]', '', 'g') = '' THEN NULL
      ELSE REGEXP_REPLACE(b.bill_number, '[^0-9]', '', 'g')::INTEGER
    END
  ) + 1
   FROM purchase_bills b
   WHERE b.tenant_id = t.id),
  1
)
WHERE purchase_bill_next_number = 1;
