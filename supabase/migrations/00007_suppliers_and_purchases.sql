-- Suppliers & Purchase bills (foundation for P&L)
-- Run after 00006_tax_compliance.sql

-- Products: stock and last purchase price (for COGS and stock checks)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS stock NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (stock >= 0),
  ADD COLUMN IF NOT EXISTS last_purchase_price NUMERIC(12,2) CHECK (last_purchase_price IS NULL OR last_purchase_price >= 0);

COMMENT ON COLUMN products.stock IS 'Quantity on hand; increased when purchase bill is recorded';
COMMENT ON COLUMN products.last_purchase_price IS 'Last purchase price (updated when recording a purchase)';

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT,
  phone      TEXT,
  address    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_suppliers_tenant_id ON suppliers(tenant_id);
CREATE INDEX idx_suppliers_tenant_name ON suppliers(tenant_id, name);
COMMENT ON TABLE suppliers IS 'Suppliers per tenant; tenant-scoped';

-- Purchase bills (header)
CREATE TABLE IF NOT EXISTS purchase_bills (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  bill_number TEXT NOT NULL,
  bill_date   DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'recorded')),
  subtotal    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total       NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, bill_number)
);

CREATE INDEX idx_purchase_bills_tenant_id ON purchase_bills(tenant_id);
CREATE INDEX idx_purchase_bills_supplier_id ON purchase_bills(supplier_id);
CREATE INDEX idx_purchase_bills_bill_date ON purchase_bills(tenant_id, bill_date DESC);
COMMENT ON TABLE purchase_bills IS 'Purchase bills; draft or recorded (recorded = stock updated)';

-- Purchase bill line items
CREATE TABLE IF NOT EXISTS purchase_bill_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_bill_id UUID NOT NULL REFERENCES purchase_bills(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity        NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  purchase_price  NUMERIC(12,2) NOT NULL CHECK (purchase_price >= 0),
  amount          NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_purchase_bill_items_bill_id ON purchase_bill_items(purchase_bill_id);
COMMENT ON TABLE purchase_bill_items IS 'Line items for a purchase bill';

-- Purchase payments (like invoice payments)
CREATE TABLE IF NOT EXISTS purchase_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  purchase_bill_id UUID NOT NULL REFERENCES purchase_bills(id) ON DELETE CASCADE,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('cash', 'upi', 'bank_transfer')),
  reference       TEXT,
  paid_at         DATE NOT NULL DEFAULT (CURRENT_DATE),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_purchase_payments_tenant_id ON purchase_payments(tenant_id);
CREATE INDEX idx_purchase_payments_bill_id ON purchase_payments(purchase_bill_id);
COMMENT ON TABLE purchase_payments IS 'Payments against purchase bills';

-- Trigger: update updated_at on purchase_bills
CREATE OR REPLACE FUNCTION set_purchase_bill_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS purchase_bills_updated_at ON purchase_bills;
CREATE TRIGGER purchase_bills_updated_at
  BEFORE UPDATE ON purchase_bills
  FOR EACH ROW EXECUTE PROCEDURE set_purchase_bill_updated_at();
