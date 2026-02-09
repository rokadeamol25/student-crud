-- Per-tenant feature config: individual toggles for product form fields, invoice search method, etc.
-- Stored as JSONB so new options can be added without more migrations.
-- UI: Settings page lets the user pick which fields to show and how product search works.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS feature_config JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN tenants.feature_config IS 'Per-tenant feature toggles: productForm.showUnit, showHsnSacCode, showTaxPercent; invoiceProductSearch.method (dropdown/typeahead). Merged on top of business_type defaults by frontend.';
