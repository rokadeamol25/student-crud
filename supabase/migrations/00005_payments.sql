-- Payments & collections: record payments against invoices; track balance
-- Run after 00004_invoice_branding.sql

-- Invoices: amount paid so far (sum of payments); balance = total - amount_paid
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0);

COMMENT ON COLUMN invoices.amount_paid IS 'Sum of payments received; balance = total - amount_paid';

-- Payments: one row per payment (cash, UPI, bank transfer)
CREATE TABLE IF NOT EXISTS payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'upi', 'bank_transfer')),
  reference   TEXT,
  paid_at     DATE NOT NULL DEFAULT (CURRENT_DATE),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_tenant_id ON payments(tenant_id);
CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);

COMMENT ON TABLE payments IS 'Manual payment records per invoice; tenant-scoped';
COMMENT ON COLUMN payments.payment_method IS 'cash | upi | bank_transfer';
COMMENT ON COLUMN payments.reference IS 'Optional: UPI ref, cheque number, etc.';

-- Backfill amount_paid from existing data (no payments yet, so 0 is correct)
UPDATE invoices SET amount_paid = 0 WHERE amount_paid IS NULL;
