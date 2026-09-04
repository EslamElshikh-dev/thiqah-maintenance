BEGIN;
SET search_path TO thiqah, public;

ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS permissions text[];

ALTER TABLE technicians
  ADD COLUMN IF NOT EXISTS permissions text[];

CREATE INDEX IF NOT EXISTS admins_status_role_idx
  ON admins(status, role);

CREATE INDEX IF NOT EXISTS technicians_status_availability_idx
  ON technicians(status, availability);

COMMIT;
