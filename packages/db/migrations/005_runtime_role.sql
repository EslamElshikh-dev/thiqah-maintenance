SET search_path TO thiqah, public;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'thiqah_app') THEN
    CREATE ROLE thiqah_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA thiqah TO thiqah_app;

-- Read-only reference and coverage data used by public settings and matching.
GRANT SELECT ON
  thiqah.services,
  thiqah.service_areas,
  thiqah.technician_services,
  thiqah.technician_areas,
  thiqah.app_settings
TO thiqah_app;

-- Mutable records used by authenticated application workflows. DELETE is
-- intentionally withheld; privacy requests anonymize records and audit/status
-- history remains append-only.
GRANT SELECT, INSERT, UPDATE ON
  thiqah.customers,
  thiqah.admins,
  thiqah.admin_mfa,
  thiqah.technicians,
  thiqah.auth_sessions,
  thiqah.otp_challenges,
  thiqah.login_challenges,
  thiqah.orders,
  thiqah.order_assignments,
  thiqah.media_upload_intents,
  thiqah.quotes,
  thiqah.password_reset_tokens,
  thiqah.idempotency_keys
TO thiqah_app;

GRANT SELECT, INSERT ON
  thiqah.order_status_events,
  thiqah.media,
  thiqah.technician_notes,
  thiqah.quote_items,
  thiqah.customer_approvals,
  thiqah.account_deletion_requests,
  thiqah.audit_logs,
  thiqah.outbox_events
TO thiqah_app;

GRANT USAGE, SELECT ON SEQUENCE thiqah.order_number_seq TO thiqah_app;
