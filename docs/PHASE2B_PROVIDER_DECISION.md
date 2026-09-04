# Phase 2B provider decision

Staging defaults to direct provider integrations:

- SMS / OTP: Unifonic
- Transactional email: Resend

Provider credentials are runtime secrets in Regional Secret Manager (`me-central2`) and are never committed to GitHub or injected as plaintext GitHub secrets. Webhook adapters remain available only as an explicit fallback.
