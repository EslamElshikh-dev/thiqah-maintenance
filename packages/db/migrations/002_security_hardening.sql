BEGIN;
SET search_path TO thiqah, public;

ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS csrf_token_hash text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_token_ciphertext text;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS client_type text NOT NULL DEFAULT 'web' CHECK (client_type IN ('web','android','ios','service'));

CREATE TABLE IF NOT EXISTS otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL CHECK (purpose IN ('customer_registration','phone_verification','login_stepup','account_deletion')),
  phone text NOT NULL CHECK (phone ~ '^05[0-9]{8}$'),
  code_hash text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_challenges_active_idx ON otp_challenges(phone, purpose, expires_at) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_mfa (
  admin_id uuid PRIMARY KEY REFERENCES admins(id) ON DELETE CASCADE,
  totp_secret_ciphertext text NOT NULL,
  recovery_code_hashes jsonb NOT NULL DEFAULT '[]'::jsonb,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz
);

CREATE TABLE IF NOT EXISTS login_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL CHECK (actor_type IN ('admin','technician','customer')),
  actor_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('mfa','stepup')),
  token_hash text NOT NULL UNIQUE,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS order_number_seq START 100001;

CREATE TABLE IF NOT EXISTS media_upload_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  object_key text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
  max_size_bytes bigint NOT NULL CHECK (max_size_bytes > 0 AND max_size_bytes <= 15728640),
  created_by_type text NOT NULL CHECK (created_by_type IN ('customer','technician','admin')),
  created_by_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_upload_intents_active_idx ON media_upload_intents(order_id, expires_at) WHERE completed_at IS NULL;

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by_admin_id uuid REFERENCES admins(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_events_pending_idx ON outbox_events(available_at, id) WHERE processed_at IS NULL;

COMMIT;
