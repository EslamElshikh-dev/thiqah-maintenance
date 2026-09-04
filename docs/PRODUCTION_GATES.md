# Thiqah v1 production gates

## P0 — must pass before any real customer data
- Git repository exists and source is committed with branch protection.
- `package-lock.json` generated from trusted npm registry and committed.
- All dependency advisories triaged; production image built from lockfile.
- Dammam data plane provisioned and verified (`me-central2`).
- PostgreSQL is external/HA with PITR; no runtime filesystem state.
- Redis HA configured; rate limiting operational.
- Private object storage blocks public access.
- Real Saudi SMS/OTP provider wired; `OTP_PROVIDER=log` impossible in production.
- Owner MFA enrolled; bootstrap password removed from secrets and environment.
- Preview deployments are `noindex` and do not use production data.
- Production custom domains and CORS origins finalized.

## P1 — must pass before Android/iOS submission
- Full BOLA/IDOR test matrix passes across customer, technician and admin roles.
- Session theft/revocation/expiry tests pass.
- Password reset tokens are hashed, one-use and not logged.
- Upload MIME/size/checksum validation and malware strategy are tested.
- Account deletion actually removes/anonymizes PII and deletes private media as promised.
- Quote approval, assignment, technician flow and completion are E2E tested.
- Audit logs are append-only and contain no passwords, OTPs or raw session tokens.
- Backups restored into an isolated environment at least once.
- Load test validates Cloud Run concurrency and DB pool under order spikes.

## P2 — store release
- Capacitor native shell, push, camera, location, deep links and secure storage completed.
- Android target SDK/API matches current Play requirement at build time.
- iOS privacy manifests/permission strings match actual collection.
- Store privacy labels/data safety forms match implemented behavior.
- Support email, legal business identity, privacy and account-deletion URLs are real.
