-- Tax & compliance: per-item tax, HSN/SAC, CGST/SGST/IGST split (India)
-- Run after 00005_payments.sql

-- Products: HSN/SAC code for compliance; optional per-product tax rate
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS hsn_sac_code TEXT,
  ADD COLUMN IF NOT EXISTS tax_percent NUMERIC(5,2) CHECK (tax_percent IS NULL OR (tax_percent >= 0 AND tax_percent <= 100));

COMMENT ON COLUMN products.hsn_sac_code IS 'HSN or SAC code (e.g. 998314); max 20 chars in app';
COMMENT ON COLUMN products.tax_percent IS 'Optional GST/tax % for this product; null = use tenant default';

-- Invoices: place of supply (intra-state = CGST+SGST, inter-state = IGST)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS gst_type TEXT NOT NULL DEFAULT 'intra' CHECK (gst_type IN ('intra', 'inter'));

COMMENT ON COLUMN invoices.gst_type IS 'intra = CGST+SGST; inter = IGST';

-- Invoice items: per-line tax and GST split amounts
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS tax_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_percent >= 0 AND tax_percent <= 100),
  ADD COLUMN IF NOT EXISTS gst_type TEXT NOT NULL DEFAULT 'intra' CHECK (gst_type IN ('intra', 'inter')),
  ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cgst_amount >= 0),
  ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (sgst_amount >= 0),
  ADD COLUMN IF NOT EXISTS igst_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (igst_amount >= 0),
  ADD COLUMN IF NOT EXISTS hsn_sac_code TEXT;

COMMENT ON COLUMN invoice_items.tax_percent IS 'Tax % for this line (snapshot from product or tenant)';
COMMENT ON COLUMN invoice_items.gst_type IS 'intra = CGST+SGST; inter = IGST';
COMMENT ON COLUMN invoice_items.cgst_amount IS 'Central GST amount (intra-state half)';
COMMENT ON COLUMN invoice_items.sgst_amount IS 'State GST amount (intra-state half)';
COMMENT ON COLUMN invoice_items.igst_amount IS 'Integrated GST amount (inter-state full)';
COMMENT ON COLUMN invoice_items.hsn_sac_code IS 'HSN/SAC snapshot from product at invoice time';

-- Backfill: set tax_percent and gst_type on existing items from parent invoice
UPDATE invoice_items ii
SET tax_percent = i.tax_percent,
    gst_type = COALESCE(i.gst_type, 'intra')
FROM invoices i
WHERE ii.invoice_id = i.id;

-- Backfill: set CGST/SGST/IGST amounts from item amount and tax_percent
UPDATE invoice_items ii
SET
  cgst_amount = CASE WHEN ii.gst_type = 'intra' THEN ROUND(ii.amount * ii.tax_percent / 200, 2) ELSE 0 END,
  sgst_amount = CASE WHEN ii.gst_type = 'intra' THEN ROUND(ii.amount * ii.tax_percent / 200, 2) ELSE 0 END,
  igst_amount = CASE WHEN ii.gst_type = 'inter' THEN ROUND(ii.amount * ii.tax_percent / 100, 2) ELSE 0 END
FROM invoices i
WHERE ii.invoice_id = i.id;
