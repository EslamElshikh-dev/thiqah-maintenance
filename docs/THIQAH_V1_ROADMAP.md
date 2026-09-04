# Thiqah v1 Production Roadmap

## What is removed
- Runtime-created `admin` account.
- Local/serverless filesystem persistence for users, orders or settings.
- Phone number as a public tracking password.
- Base64 order images inside JSON requests.
- Preview indexing and deployment-specific canonical/sitemap URLs.
- Production OTP/password-reset logging.
- Admin functions from the future mobile customer application.

## What is fixed
- Source control and reproducible runtime baseline.
- Verified phone registration via OTP.
- Opaque server-side sessions; MFA for administrators.
- Browser CSRF protection and strict CORS origin.
- Server-side customer/technician/admin authorization.
- Atomic order state transitions and technician assignment.
- Idempotent order creation.
- Encrypted tracking secrets and hashed lookup secrets.
- Direct private-object-storage uploads.
- Password reset tokens hashed and session revocation after reset.
- Account deletion/anonymization flow.
- Cursor pagination and audit logging.
- Dammam data-plane infrastructure design.

## What is added
- Quote → customer approval workflow.
- Technician service/area qualification gate.
- Append-only status timeline and audit logs.
- Transactional outbox foundation for SMS/WhatsApp/push/email.
- Cloud SQL + PITR, Redis, private media bucket and Regional Secret Manager; production parameters require HA while staging may use cost-controlled zonal/basic tiers.
- Web API client adapter for the existing UI migration.
- Capacitor mobile release scaffold and store gates.

## Execution order
### Phase 1 — Source & Security Foundation
Code, schema, RBAC, OTP/MFA, storage intents, IaC, CI gates and tests.

### Phase 2 — Staging-ready source (current bundle)
OIDC/WIF CI/CD, regional secrets, IAM database auth, Direct VPC egress, hardened media verification, remote-state runbook and staging release gates are implemented.

### Phase 2B — Connected staging
Create the private GitHub repo, generate/commit the lockfile, apply the reviewed Dammam Terraform plan, provision regional secret versions, wire real SMS/email providers, deploy the immutable image, create one owner and connect a staging domain.

### Phase 3 — Product operations
Complete admin UX, technician onboarding, quote editor, invoice/payment provider integration, warranty, notification worker, audit viewer and operational reports.

### Phase 4 — Security verification
BOLA matrix, CSRF/session abuse, upload abuse, rate limiting, password reset, deletion, backup restore, load test and dependency/SAST scans.

### Phase 5 — Mobile
Capacitor Android/iOS shell, push, camera/photo picker, location, deep links, secure storage, native QA and store privacy forms.

### Phase 6 — Production cutover
Final domain/canonical, data migration if any real data exists, traffic cutover, rollback rehearsal, monitoring and store submission.
