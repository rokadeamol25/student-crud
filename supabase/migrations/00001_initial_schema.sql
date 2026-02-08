-- Multi-tenant billing MVP: initial schema
-- Run this in Supabase SQL Editor (or via Supabase CLI) in order.
-- Purpose: Create tenants, users (link to Supabase Auth), products, customers, invoices, invoice_items.
-- Tenant isolation: every tenant-scoped table has tenant_id; all API queries MUST filter by tenant_id.

-- Enable UUID extension if not already
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- TENANTS: one row per shop
-- =============================================================================
CREATE TABLE tenants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);

COMMENT ON TABLE tenants IS 'One row per shop (tenant).';

-- =============================================================================
-- USERS: links Supabase Auth user to one tenant (MVP: one user per tenant)
-- =============================================================================
CREATE TABLE users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id    UUID NOT NULL UNIQUE,
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_users_auth_id ON users(auth_id);
CREATE INDEX idx_users_tenant_id ON users(tenant_id);

COMMENT ON TABLE users IS 'Maps Supabase Auth uid (auth_id) to tenant. Backend resolves tenant_id from JWT sub.';

-- =============================================================================
-- PRODUCTS: tenant-scoped
-- =============================================================================
CREATE TABLE products (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  price      NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  unit       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_tenant_id ON products(tenant_id);
CREATE INDEX idx_products_tenant_name ON products(tenant_id, name);

COMMENT ON TABLE products IS 'Products per tenant. All queries must filter by tenant_id.';

-- =============================================================================
-- CUSTOMERS: tenant-scoped
-- =============================================================================
CREATE TABLE customers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT,
  phone      TEXT,
  address    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_tenant_id ON customers(tenant_id);
CREATE INDEX idx_customers_tenant_name ON customers(tenant_id, name);

COMMENT ON TABLE customers IS 'Customers per tenant.';

-- =============================================================================
-- INVOICES: tenant-scoped; invoice_number unique per tenant
-- =============================================================================
CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  invoice_number  TEXT NOT NULL,
  invoice_date    DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid')),
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, invoice_number)
);

CREATE INDEX idx_invoices_tenant_id ON invoices(tenant_id);
CREATE INDEX idx_invoices_tenant_date ON invoices(tenant_id, invoice_date DESC);
CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);

COMMENT ON TABLE invoices IS 'Invoice header. invoice_number is unique per tenant (e.g. INV-0001).';

-- =============================================================================
-- INVOICE_ITEMS: line items; snapshot description/price at invoice time
-- =============================================================================
CREATE TABLE invoice_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity    NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  amount      NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_items_invoice_id ON invoice_items(invoice_id);

COMMENT ON TABLE invoice_items IS 'Line items for an invoice. product_id optional; description/unit_price stored for history.';

-- =============================================================================
-- HELPER: update updated_at on invoices
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
