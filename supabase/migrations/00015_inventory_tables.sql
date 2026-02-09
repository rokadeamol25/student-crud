-- ======================================
-- product_serials: one row per serial/IMEI unit
-- ======================================
CREATE TABLE IF NOT EXISTS product_serials (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id            UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  serial_number         TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'available',
  purchase_bill_item_id UUID REFERENCES purchase_bill_items(id) ON DELETE SET NULL,
  invoice_item_id       UUID REFERENCES invoice_items(id) ON DELETE SET NULL,
  cost_price            NUMERIC(12,2),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT product_serials_status_check
    CHECK (status IN ('available', 'sold', 'returned', 'damaged'))
);

-- A serial number must be unique within a tenant (cross-product)
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_serials_tenant_serial
  ON product_serials (tenant_id, serial_number);

CREATE INDEX IF NOT EXISTS idx_product_serials_product
  ON product_serials (product_id, status);

-- ======================================
-- product_batches: one row per batch/lot
-- ======================================
CREATE TABLE IF NOT EXISTS product_batches (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id            UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  batch_number          TEXT NOT NULL,
  expiry_date           DATE,
  quantity              NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_price            NUMERIC(12,2),
  purchase_bill_item_id UUID REFERENCES purchase_bill_items(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT product_batches_qty_check CHECK (quantity >= 0)
);

-- A batch number is unique per product within a tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_batches_tenant_product_batch
  ON product_batches (tenant_id, product_id, batch_number);

CREATE INDEX IF NOT EXISTS idx_product_batches_product
  ON product_batches (product_id);

-- ======================================
-- stock_movements: append-only audit ledger
-- ======================================
CREATE TABLE IF NOT EXISTS stock_movements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  movement_type  TEXT NOT NULL,
  direction      TEXT NOT NULL,
  quantity       NUMERIC(12,2) NOT NULL,
  reference_type TEXT,
  reference_id   UUID,
  serial_id      UUID REFERENCES product_serials(id) ON DELETE SET NULL,
  batch_id       UUID REFERENCES product_batches(id) ON DELETE SET NULL,
  cost_price     NUMERIC(12,2),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT stock_movements_type_check
    CHECK (movement_type IN ('purchase', 'sale', 'return', 'adjustment', 'damage')),
  CONSTRAINT stock_movements_direction_check
    CHECK (direction IN ('in', 'out')),
  CONSTRAINT stock_movements_qty_check
    CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product
  ON stock_movements (product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant
  ON stock_movements (tenant_id, created_at DESC);

COMMENT ON TABLE product_serials  IS 'Individual serial/IMEI tracked units';
COMMENT ON TABLE product_batches  IS 'Batch/lot tracked inventory';
COMMENT ON TABLE stock_movements  IS 'Append-only inventory audit ledger';
