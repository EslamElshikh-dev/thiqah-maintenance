# Thiqah v1 free staging runbook

This is the selected Phase 2B staging path:

**Render Free → Neon PostgreSQL → Render Key Value → Cloudflare R2**

Unifonic provides OTP/SMS and Resend provides transactional password-reset email. Existing Supabase projects and the legacy Vercel production deployment are not modified. The GCP implementation remains available only as a future alternative.

## 1. Source gate — complete

- Repository: `EslamElshikh-dev/thiqah-maintenance`
- Staging branch: `feat/phase2-connected-staging`
- PR #1 remains Draft.
- Node.js is pinned to 24.x.
- The committed lockfile contains the exact R2/S3 packages.
- CI gates clean install, tests/syntax, and Docker image build.
- `render.yaml` deploys only after GitHub checks pass.

## 2. Neon PostgreSQL

Create a dedicated Thiqah staging database. Prefer a European region close to the Render Frankfurt service.

Keep two connection paths where practical:

1. **Migration/admin connection** — stored only in the protected GitHub environment `free-staging-db` as `NEON_DATABASE_URL_ADMIN`.
2. **Runtime connection** — configured only in Render as `DATABASE_URL`. A least-privilege runtime role is preferred; using the database owner for production is not acceptable.

Both URLs must require TLS.

Run the manual GitHub workflow `Migrate Free Staging Database` and enter `MIGRATE`. The launcher lives on `main` but deliberately checks out `feat/phase2-connected-staging`, so the application PR can remain Draft while staging is prepared.

The workflow runs the checksum-protected migration runner and then verifies the `thiqah` schema, `thiqah.orders`, and migration ledger.

## 3. Render Key Value

Create a dedicated internal-only Key Value instance for Thiqah staging in the same Frankfurt region and configure its private `redis://` URL in Render as `REDIS_URL`.

The existing `ioredis` integration enforces TLS for `rediss://`, uses short connection/command timeouts, and is used for distributed rate limiting and session-related shared state.

Do not use instance-local memory as a persistence substitute.

## 4. Cloudflare R2 private media

Create one private bucket dedicated to Thiqah staging. Do not enable a public bucket URL.

Create an application token limited to the Thiqah bucket and the object operations required by the API, then configure these values only in Render:

- `R2_ACCOUNT_ID`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

Configure bucket CORS for the exact HTTPS frontend origin(s). Use `infra/free/r2-cors.example.json` as the reviewed template and replace the placeholder origin before applying it.

The application generates 10-minute signed PUT URLs and 5-minute signed GET URLs. Uploads are bound to the intended content type and `If-None-Match: *`; completion performs server-side size, file-signature and SHA-256 validation before inserting the media record.

## 5. Unifonic and Resend

### Unifonic

- Activate the SMS account/application.
- Obtain an AppSid.
- Use an approved Sender ID.
- Configure `UNIFONIC_APPSID` and `SMS_SENDER_ID` only in Render.
- Send one real Saudi staging OTP before accepting the integration.

### Resend

- Verify the staging sender/domain.
- Create a sending-only API key.
- Configure `RESEND_API_KEY` and `SUPPORT_FROM_EMAIL` only in Render.
- Complete one real password-reset delivery and token-consumption test.

## 6. Render Free API

Create a Blueprint from repository `render.yaml`.

The committed Blueprint selects:

- Docker runtime
- Frankfurt region
- Free plan
- `/health/ready` health check
- staging branch
- deploy only after GitHub checks pass
- Neon URL database mode
- Render Key Value
- R2 storage
- Unifonic OTP
- Resend email

For every `sync:false` value, enter the value in Render's protected configuration UI. Never commit it to Git.

Render generates the application HMAC/encryption values declared with `generateValue: true`. Do not replace them with predictable strings.

Because Render Free can sleep when idle and does not provide the paid pre-deploy migration feature, migrations stay in the separate manual GitHub workflow. Run migrations before the first Render deployment that depends on a new schema.

## 7. First connected sequence

1. Create Neon and configure the protected migration connection.
2. Run `Migrate Free Staging Database` and verify success.
3. Create Render Key Value.
4. Create/configure the private R2 bucket and its CORS policy.
5. Activate Unifonic and Resend.
6. Create the Render Blueprint and fill protected runtime configuration.
7. Let GitHub CI pass and Render deploy the reviewed branch.
8. Verify `/health/live` and `/health/ready`.
9. Exercise a real R2 upload/read lifecycle.
10. Verify one OTP and one password-reset delivery.
11. Bootstrap the owner exactly once with MFA and immediately remove the temporary bootstrap values.

## 8. Security acceptance before mobile work

Complete `docs/PHASE2B_CONNECTED_STAGING_CHECKLIST.md`, including:

- customer A cannot access customer B resources
- technician sees only active assigned work
- admin MFA and replay protection
- CSRF enforcement
- auth/OTP/tracking/order rate limits
- one-time reset tokens
- non-enumerable public tracking
- R2 no-overwrite and file-integrity checks
- account-deletion/session-revocation behavior
- database recovery procedure

Only then open the Capacitor Android/iOS release gate.

## 9. Scope

This free stack is approved for staging and limited pilot validation. Render Free sleep behavior, provider free-tier limits, operational support and recovery guarantees must be re-evaluated before a production launch.
