BEGIN;
SET search_path TO thiqah, public;

ALTER TABLE admin_mfa
  ADD COLUMN IF NOT EXISTS last_totp_code_hash text;

COMMIT;
