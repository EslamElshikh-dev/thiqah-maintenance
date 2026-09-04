# Phase 2B — Connected Dammam Staging checklist

## A. Saudi Google Cloud access

- [ ] CNTXT / Google Cloud account has access to Dammam `me-central2`.
- [ ] Staging project ID recorded.
- [ ] Regional Terraform state bucket created in `me-central2`.
- [ ] Terraform `plan` reviewed before apply.
- [ ] Cloud SQL PostgreSQL, Redis, private Storage, regional Secret Manager, Artifact Registry, regional Logging, service accounts and WIF created.

## B. Messaging providers

### Unifonic OTP
- [ ] Unifonic account active.
- [ ] SMS application/AppSid created.
- [ ] `THIQAH` (or approved replacement) Sender ID registered and approved.
- [ ] AppSid stored only as a Regional Secret Manager version.
- [ ] One real Saudi staging OTP send succeeds.

### Resend transactional email
- [ ] Sender domain/address verified.
- [ ] Sending-only API key created.
- [ ] API key stored only as a Regional Secret Manager version.
- [ ] Password-reset email delivered and link fragment cleared by the client after consumption.

## C. Connected deployment

- [ ] GitHub `staging` environment variables populated from reviewed Terraform outputs.
- [ ] WIF authentication succeeds with no JSON service-account key.
- [ ] Database release job succeeds.
- [ ] Cloud Run staging API deploys the immutable image digest.
- [ ] `/health/live` passes.
- [ ] `/health/ready` passes with PostgreSQL + Redis.
- [ ] Owner bootstrap runs once through the protected workflow.
- [ ] Bootstrap secret versions are destroyed immediately after success.

## D. Security acceptance

- [ ] Customer cross-account BOLA tests fail closed.
- [ ] Technician can access only assigned active work.
- [ ] Admin MFA login and replay protection verified.
- [ ] CSRF browser mutations fail without the correct token/origin.
- [ ] OTP/login/tracking/order rate limits verified.
- [ ] Reset tokens are one-time and short-lived.
- [ ] Signed upload cannot overwrite and server validates size, magic bytes and SHA-256.
- [ ] Account deletion revokes sessions and applies retention rules.
- [ ] PITR/restore drill completed.

Only after every item above is complete should the Capacitor Android/iOS release gate open.
