-- Add product extra columns to invoice_items so they appear on printed invoices
-- These are copied from the product at invoice creation time (snapshot).

ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS company     TEXT,
  ADD COLUMN IF NOT EXISTS ram_storage TEXT,
  ADD COLUMN IF NOT EXISTS imei        TEXT,
  ADD COLUMN IF NOT EXISTS color       TEXT;
