-- Tenant business type: drives feature config (product form columns, invoice product search method, etc.)
-- See docs/BUSINESS_TYPE_STRATEGY.md
-- Requires: tenants table (created in 00001_initial_schema.sql). Run migrations in order 00001 -> 00009.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_type TEXT;
    COMMENT ON COLUMN tenants.business_type IS 'Optional: default, retail, services, manufacturing, etc. Used by frontend to select feature config in src/config/businessTypes.js';
  END IF;
END $$;
