-- Role per user: only 'owner' can access Settings and danger-zone actions.
-- Existing users default to 'owner' so current tenants keep full access.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner'
  CHECK (role IN ('owner', 'staff'));

COMMENT ON COLUMN users.role IS 'owner: can access Settings and danger actions; staff: cannot.';

