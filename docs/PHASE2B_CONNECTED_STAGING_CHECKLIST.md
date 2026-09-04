# Phase 2B — Free connected staging checklist

Selected stack: Render Free + Neon PostgreSQL + Cloudflare R2 + Upstash Redis.

## A. Data and runtime services

- [ ] Create a dedicated Neon project for Thiqah staging.
- [ ] Keep the migration database connection in the protected GitHub `free-staging-db` environment.
- [ ] Configure the Render runtime database connection separately.
- [ ] Run `Migrate Free Staging Database` with `confirm=MIGRATE` and verify six or more checksum-tracked migrations.
- [ ] Create a dedicated Upstash TLS Redis database and configure Render with its Redis URL.
- [ ] Create a private Cloudflare R2 bucket dedicated to Thiqah staging.
- [ ] Restrict the R2 API token to the Thiqah bucket and required object operations only.
- [ ] Configure R2 CORS only for approved HTTPS frontend origins and the required upload headers.

## B. Messaging providers

### Unifonic OTP
- [ ] Unifonic account is active.
- [ ] AppSid is configured in Render.
- [ ] Sender ID is approved.
- [ ] One real staging OTP delivery succeeds.

### Resend email
- [ ] Sender domain/address is verified.
- [ ] Sending API key is configured in Render.
- [ ] One password-reset email is delivered successfully.
- [ ] Reset URL fragment is cleared by the client after consumption.

## C. Render deployment

- [ ] Create the Render Blueprint from repository `render.yaml`.
- [ ] Region is Frankfurt and plan is Free.
- [ ] All `sync:false` configuration values are set in Render, not committed to Git.
- [ ] Auto-deploy remains gated by successful GitHub checks.
- [ ] `/health/live` passes.
- [ ] `/health/ready` passes with PostgreSQL and Redis reachable.
- [ ] R2 signed upload and private read URL pass against the real bucket.
- [ ] Owner bootstrap runs once and MFA login succeeds.
- [ ] Temporary owner-bootstrap values are removed immediately after success.

## D. Security acceptance

- [ ] Customer cross-account BOLA tests fail closed.
- [ ] Technician can access only assigned active work.
- [ ] Admin MFA login and replay protection are verified.
- [ ] CSRF browser mutations fail without the correct token/origin.
- [ ] OTP/login/tracking/order rate limits are verified.
- [ ] Reset tokens are one-time and short-lived.
- [ ] R2 signed upload cannot overwrite and server validation enforces size, magic bytes and SHA-256.
- [ ] Account deletion revokes sessions and applies retention rules.
- [ ] Neon restore/recovery procedure is documented and tested to the extent supported by the selected staging tier.

## E. Scope guardrails

- [x] Existing Supabase projects remain untouched.
- [x] Legacy Vercel production remains untouched.
- [x] GCP/CNTXT is not required for this staging path.
- [ ] Free-tier usage is reviewed before any production or high-volume pilot.

Only after this checklist passes should the Capacitor Android/iOS release gate open.
