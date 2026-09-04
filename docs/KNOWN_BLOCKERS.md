# Known blockers outside the source repository

## Resolved in GitHub

- Repository creation and source publication are complete.
- The committed lockfile includes the pinned R2/S3 dependencies.
- Node.js 24 install/check and Docker build are CI-gated.
- PostgreSQL URL mode works with Neon.
- Redis URL mode works with the internal Render Key Value instance through the existing `ioredis` client.
- Cloudflare R2 private media support is implemented with short-lived signed upload/read URLs, overwrite protection, and server-side size, magic-byte and SHA-256 validation.
- Native Unifonic OTP/SMS and Resend password-reset adapters are implemented and tested.
- A Render Free Blueprint and protected Neon migration workflow are committed.

## Remaining external gates

1. Complete connected health verification for the dedicated Neon database and restricted Render runtime role.
2. Complete connected health verification for the dedicated internal Render Key Value instance.
3. Create a private R2 bucket, restrict its application token to that bucket, and configure browser CORS for the approved staging frontend origin(s).
4. Create the Render service from `render.yaml` and complete its protected runtime configuration.
5. Activate Unifonic with an approved Sender ID for a real OTP test.
6. Verify the Resend sender and complete a real password-reset delivery test.
7. Run migrations, deploy staging, pass health checks, bootstrap the owner once with MFA, then complete the security acceptance checklist.

## Not blockers for free staging

- GCP/CNTXT/Dammam is no longer required for the selected staging path.
- Existing Supabase projects are not used or modified.
- The GCP Terraform/WIF implementation remains only as an optional future production path.

The legacy Vercel production deployment remains untouched. The Free Stack is for staging and limited pilot validation, not a production-readiness claim.
