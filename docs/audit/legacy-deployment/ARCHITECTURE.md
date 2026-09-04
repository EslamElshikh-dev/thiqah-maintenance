# Recommended Thiqah v1 Architecture

## Decision

Keep Vercel only for the public/static web surface if desired. Move the sensitive **data plane** to Google Cloud Dammam `me-central2`.

Current Google Cloud documentation (checked 2026-09-04) lists Dammam/Saudi Arabia support for Cloud Run, Cloud SQL, Cloud Storage and Memorystore for Redis.

## Target topology

```text
Web/PWA on final domain
        |
        | HTTPS
        v
api.thiqah.<domain>
Cloud Run - me-central2 (Dammam)
        |
        +---- Cloud SQL PostgreSQL - me-central2, private IP, HA
        |
        +---- Private Cloud Storage bucket - me-central2
        |       signed short-lived upload/download URLs
        |
        +---- Memorystore Redis - me-central2
        |       rate limits / OTP throttles / short-lived locks
        |
        +---- notification outbox / regional task worker
```

## Why this is preferable to the current deployment

- Durable shared persistence across instances.
- Database and object data can be located in Saudi Arabia.
- Server code is containerized/reproducible instead of a mystery single Lambda bundle.
- Private DB networking and explicit migrations.
- Direct uploads avoid Lambda request-size and memory pressure.
- Easier separation of web, API, jobs and mobile clients.

## API contract rules

- `/v1` version prefix for new APIs.
- JSON schema validation at ingress.
- Opaque UUIDs internally; human order numbers externally.
- Opaque tracking token, stored hashed.
- Cookie session for web; short-lived access + rotating refresh token stored in native secure storage for mobile.
- Authorization policy in server service layer, not controller/client only.
- Every privileged mutation emits an audit record.

## Storage rules

- Bucket is private; no public household images.
- Object key generated server-side: `orders/<order_uuid>/<media_uuid>.jpg`.
- Upload URL TTL <= 10 minutes.
- Allowed image MIME list; verify magic bytes, not extension only.
- Strip metadata/re-encode server-side or trusted image pipeline when required.
- Store SHA-256, MIME, byte size and creator identity in DB.
- Delete/anonymize according to account deletion + legal retention policy.

## Authentication

### Customer
- Saudi phone OTP required for account creation.
- Optional email becomes recovery channel only after verification.
- Password may remain supported, but OTP/password recovery must have anti-abuse controls.

### Technician
- Admin-invited account.
- Verified phone/email.
- Strong password + optional/required MFA depending risk.
- Device/session list and revocation.

### Admin
- Named individual accounts only.
- Mandatory MFA.
- No persistent shared `admin` account.
- Recovery-email changes require recent password + MFA.
- High-risk actions may require re-authentication.

## Environments

- `preview`: synthetic/test data only; `noindex`; separate DB/bucket.
- `staging`: production-like, no live customer data.
- `production`: isolated project/resources, backups, alerting, final domain.

Never share databases/buckets between Preview and Production.
