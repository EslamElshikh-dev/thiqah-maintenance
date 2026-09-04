-- Thiqah v1 proposed PostgreSQL schema.
-- Reference only: NOT applied to any production database.
-- Target: PostgreSQL 16/17 (e.g. Cloud SQL Dammam me-central2).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS thiqah;
SET search_path TO thiqah, public;

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  phone text NOT NULL CHECK (phone ~ '^05[0-9]{8}$'),
  phone_verified_at timestamptz,
  email text,
  email_verified_at timestamptz,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','pending_deletion','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX customers_phone_uq ON customers(phone) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX customers_email_uq ON customers(lower(email)) WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  display_name text NOT NULL,
  email text NOT NULL,
  email_verified_at timestamptz,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'operator' CHECK (role IN ('owner','admin','operator','finance','support')),
  mfa_required boolean NOT NULL DEFAULT true,
  mfa_enrolled_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX admins_username_uq ON admins(lower(username));
CREATE UNIQUE INDEX admins_email_uq ON admins(lower(email));

CREATE TABLE technicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  phone text NOT NULL CHECK (phone ~ '^05[0-9]{8}$'),
  phone_verified_at timestamptz,
  email text,
  email_verified_at timestamptz,
  password_hash text NOT NULL,
  specialty text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  availability text NOT NULL DEFAULT 'available' CHECK (availability IN ('available','busy','off_duty')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX technicians_phone_uq ON technicians(phone);
CREATE UNIQUE INDEX technicians_email_uq ON technicians(lower(email)) WHERE email IS NOT NULL;

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL CHECK (actor_type IN ('customer','technician','admin')),
  actor_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent_hash text,
  ip_prefix_hash text
);
CREATE INDEX auth_sessions_actor_idx ON auth_sessions(actor_type, actor_id) WHERE revoked_at IS NULL;
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  description_ar text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL UNIQUE,
  city text NOT NULL DEFAULT 'الرياض',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE technician_services (
  technician_id uuid NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  PRIMARY KEY (technician_id, service_id)
);

CREATE TABLE technician_areas (
  technician_id uuid NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES service_areas(id) ON DELETE RESTRICT,
  PRIMARY KEY (technician_id, area_id)
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  tracking_token_hash text NOT NULL UNIQUE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  guest_name text,
  guest_phone text CHECK (guest_phone IS NULL OR guest_phone ~ '^05[0-9]{8}$'),
  guest_phone_verified_at timestamptz,
  contact_name text NOT NULL,
  contact_phone text NOT NULL CHECK (contact_phone ~ '^05[0-9]{8}$'),
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  description text NOT NULL CHECK (char_length(description) BETWEEN 5 AND 4000),
  customer_notes text CHECK (customer_notes IS NULL OR char_length(customer_notes) <= 2000),
  appointment_date date,
  appointment_window text,
  address_text text CHECK (address_text IS NULL OR char_length(address_text) <= 500),
  latitude numeric(9,6),
  longitude numeric(9,6),
  status text NOT NULL DEFAULT 'new' CHECK (status IN (
    'new','triage','quoted','customer_approved','assigned','technician_accepted',
    'on_the_way','in_progress','awaiting_customer_confirmation','completed','cancelled'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)),
  CHECK (customer_id IS NOT NULL OR (guest_name IS NOT NULL AND guest_phone IS NOT NULL))
);
CREATE INDEX orders_customer_created_idx ON orders(customer_id, created_at DESC);
CREATE INDEX orders_status_created_idx ON orders(status, created_at DESC);
CREATE INDEX orders_appointment_idx ON orders(appointment_date, status);

CREATE TABLE order_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  technician_id uuid NOT NULL REFERENCES technicians(id) ON DELETE RESTRICT,
  assigned_by_admin_id uuid NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  rejected_at timestamptz,
  ended_at timestamptz,
  rejection_reason text
);
CREATE UNIQUE INDEX order_active_assignment_uq ON order_assignments(order_id) WHERE ended_at IS NULL;
CREATE INDEX technician_active_assignments_idx ON order_assignments(technician_id, assigned_at DESC) WHERE ended_at IS NULL;

CREATE TABLE order_status_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  from_status text,
  to_status text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('system','customer','technician','admin')),
  actor_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_status_events_order_idx ON order_status_events(order_id, created_at, id);

CREATE TABLE media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('customer_problem','before_work','after_work','invoice_attachment','warranty_attachment')),
  object_key text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 15728640),
  sha256_hex text NOT NULL CHECK (sha256_hex ~ '^[0-9a-f]{64}$'),
  created_by_type text NOT NULL CHECK (created_by_type IN ('customer','technician','admin','system')),
  created_by_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX media_order_idx ON media(order_id, created_at) WHERE deleted_at IS NULL;

CREATE TABLE technician_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  technician_id uuid NOT NULL REFERENCES technicians(id) ON DELETE RESTRICT,
  note text NOT NULL CHECK (char_length(note) BETWEEN 2 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX technician_notes_order_idx ON technician_notes(order_id, created_at);

CREATE TABLE quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number text NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','approved','rejected','expired','cancelled')),
  currency char(3) NOT NULL DEFAULT 'SAR',
  subtotal numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_rate numeric(5,2) NOT NULL DEFAULT 15.00 CHECK (tax_rate BETWEEN 0 AND 100),
  tax_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  valid_until timestamptz,
  notes text,
  created_by_admin_id uuid NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz
);
CREATE INDEX quotes_order_idx ON quotes(order_id, created_at DESC);

CREATE TABLE quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(14,2) NOT NULL CHECK (line_total >= 0),
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE customer_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  ip_prefix_hash text,
  user_agent_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX customer_approval_once_uq ON customer_approvals(quote_id, decision) WHERE decision = 'approved';

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('draft','issued','unpaid','paid','void','refunded')),
  currency char(3) NOT NULL DEFAULT 'SAR',
  subtotal numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_rate numeric(5,2) NOT NULL DEFAULT 15.00 CHECK (tax_rate BETWEEN 0 AND 100),
  tax_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  issued_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoices_order_idx ON invoices(order_id, created_at DESC);

CREATE TABLE invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(14,2) NOT NULL CHECK (line_total >= 0),
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_payment_id text,
  status text NOT NULL CHECK (status IN ('pending','authorized','paid','failed','cancelled','refunded','partially_refunded')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL DEFAULT 'SAR',
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payments_provider_ref_uq ON payments(provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL;

CREATE TABLE warranties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  title text NOT NULL,
  terms text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','void')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX warranties_order_idx ON warranties(order_id, status);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text CHECK (actor_type IN ('customer','technician','admin')),
  actor_id uuid,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('sms','whatsapp','push','email')),
  template_key text NOT NULL,
  destination_masked text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','failed','cancelled')),
  provider_message_id text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX notifications_queue_idx ON notifications(status, next_attempt_at) WHERE status IN ('queued','failed');

CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL CHECK (actor_type IN ('customer','technician','admin')),
  actor_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  requested_ip_prefix_hash text
);
CREATE INDEX password_reset_active_idx ON password_reset_tokens(actor_type, actor_id, expires_at) WHERE used_at IS NULL;

CREATE TABLE account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  identifier_hash text,
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','identity_verified','approved','rejected','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  completed_at timestamptz,
  handled_by_admin_id uuid REFERENCES admins(id) ON DELETE SET NULL
);

CREATE TABLE idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  idempotency_key text NOT NULL,
  actor_type text,
  actor_id uuid,
  request_hash text NOT NULL,
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (scope, idempotency_key)
);
CREATE INDEX idempotency_expiry_idx ON idempotency_keys(expires_at);

CREATE TABLE audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_type text NOT NULL CHECK (actor_type IN ('system','customer','technician','admin')),
  actor_id uuid,
  action text NOT NULL,
  object_type text NOT NULL,
  object_id text,
  outcome text NOT NULL DEFAULT 'success' CHECK (outcome IN ('success','denied','failed')),
  request_id text,
  ip_prefix_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_logs_object_idx ON audit_logs(object_type, object_id, occurred_at DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs(actor_type, actor_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION prevent_update_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER order_status_events_append_only
BEFORE UPDATE OR DELETE ON order_status_events
FOR EACH ROW EXECUTE FUNCTION prevent_update_delete();

CREATE TRIGGER audit_logs_append_only
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_update_delete();

COMMIT;
