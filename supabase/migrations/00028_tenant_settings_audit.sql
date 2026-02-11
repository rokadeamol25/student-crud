-- Optional audit log for Settings and danger-zone actions.
-- Used by GET /api/me/audit and written on PATCH /api/me, reset-invoice-numbering, delete-data.

CREATE TABLE IF NOT EXISTS tenant_settings_audit (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action     TEXT NOT NULL,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_settings_audit_tenant_created
  ON tenant_settings_audit (tenant_id, created_at DESC);

COMMENT ON TABLE tenant_settings_audit IS 'Audit log for Settings changes and danger-zone actions (reset numbering, delete data).';
