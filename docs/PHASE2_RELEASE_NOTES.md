# Phase 2 release notes — free staging foundation

Current release track: `thiqah-v1-phase2-free-staging`.

This release does **not** modify or replace the legacy Vercel deployment. It prepares the clean v1 source for the selected staging path: Render Free + Neon PostgreSQL + Cloudflare R2 + Render Key Value.

## Core security and reliability foundation

- Node engine pinned to 24.x; Docker runtime is distroless and non-root.
- Browser sessions are opaque HttpOnly sessions with CSRF protection.
- Admin TOTP MFA is mandatory in deployed environments and same-timestep replay is rejected.
- OTP issuance serializes per phone/purpose, retires older challenges, and uses constant-time hash comparison.
- Customer registration consumes OTP and creates account/session atomically.
- Guest and authenticated order creation combine idempotency and order creation in one database transaction.
- Technician assignments and availability transitions are transactionally coordinated.
- Invalid UUID/phone/password/date/timestamp/integer inputs fail as validation errors before unsafe database casts.
- Database migrations use SHA-256 checksums plus a PostgreSQL advisory lock.
- Phase 1 migrations 001–004 remain preserved.

## Selected free staging infrastructure

- API: Render Free Docker service in Frankfurt.
- Database: dedicated Neon PostgreSQL via TLS connection URL.
- Shared Redis: dedicated internal Render Key Value via `redis://`.
- Media: private Cloudflare R2 bucket through the S3-compatible API.
- R2 upload intents use short-lived signed PUT URLs and `If-None-Match: *` to prevent overwrite reuse.
- Media completion streams the object server-side and validates size, magic bytes and SHA-256 before database registration.
- Private media reads use RBAC plus short-lived signed GET URLs.
- Database migrations are deliberately separated from Render startup and are launched manually through the protected GitHub `free-staging-db` environment.
- Render auto-deploy is gated by successful GitHub checks.

## Messaging

- Unifonic direct OTP/SMS adapter is implemented and tested.
- Resend direct password-reset email adapter is implemented and tested.
- Webhook adapters remain available only as fallback integration paths.

## CI validation

GitHub Actions now validates the committed source with:

- Node.js 24
- committed `package-lock.json`
- `npm ci --ignore-scripts --no-audit --no-fund`
- `npm run check`, including core, provider and Free Stack tests
- R2 signed-upload configuration assertions
- JavaScript/syntax gates
- Docker production-image build with Buildx

A fresh release manifest will be generated only after connected staging acceptance; the original 93-file Phase 2 SHA-256 manifest is intentionally marked as a previous snapshot so it cannot be mistaken for the evolved Free Stack tree.

## Optional GCP path retained

The Dammam/GCP implementation remains in `infra/gcp/` as a future production option, including Terraform, Cloud SQL IAM auth, WIF, Regional Secret Manager and GCS. It is no longer a prerequisite for Phase 2B staging.

## Remaining external gates

1. Create and connect the dedicated Neon staging database.
2. Verify the connected internal Render Key Value instance.
3. Create/configure the private R2 bucket and its CORS policy.
4. Activate Unifonic Sender ID/AppSid and pass a real OTP test.
5. Verify the Resend sender and pass a real password-reset delivery test.
6. Create the Render Blueprint and complete protected runtime configuration.
7. Run migrations, health checks, R2 lifecycle checks, one-time owner MFA bootstrap, and full E2E/security acceptance.

Existing Supabase projects remain untouched. The Free Stack is approved for staging/limited pilot validation only; production capacity, recovery guarantees and service-level requirements must be re-evaluated before launch.
