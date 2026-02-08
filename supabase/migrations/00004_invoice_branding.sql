-- Invoice branding: header/footer notes, logo URL, page size
-- Run after 00003_invoice_numbering.sql

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS invoice_header_note TEXT,
  ADD COLUMN IF NOT EXISTS invoice_footer_note TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS invoice_page_size TEXT NOT NULL DEFAULT 'A4' CHECK (invoice_page_size IN ('A4', 'Letter'));

COMMENT ON COLUMN tenants.invoice_header_note IS 'Optional note shown above Bill to on printed invoice';
COMMENT ON COLUMN tenants.invoice_footer_note IS 'Optional note shown below thank-you on printed invoice';
COMMENT ON COLUMN tenants.logo_url IS 'URL of tenant logo (e.g. Supabase Storage public URL)';
COMMENT ON COLUMN tenants.invoice_page_size IS 'Page size for print/PDF: A4 or Letter';
