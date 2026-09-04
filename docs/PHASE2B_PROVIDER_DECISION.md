# Phase 2B provider decision

Selected staging stack:

- API runtime: Render Free
- PostgreSQL: Neon
- shared Redis: Upstash
- private object storage: Cloudflare R2
- SMS / OTP: Unifonic
- transactional email: Resend

Provider/runtime values are configured only in the relevant protected service settings. They are never committed to Git or exposed through public frontend environment variables. Webhook messaging adapters and the GCP infrastructure remain available only as optional fallback/future paths.
