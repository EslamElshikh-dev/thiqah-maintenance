# Thiqah v1

Security-first rebuild of **ثقة للصيانة المنزلية**. The legacy Vercel deployment is not treated as a persistence or production source of truth.

## Current Phase 2B staging architecture

- Web/PWA and future Capacitor clients.
- API: Node.js 24 + Fastify in a Docker container on Render Free, Frankfurt.
- Database: dedicated Neon PostgreSQL over TLS.
- Shared Redis: dedicated internal Render Key Value (Valkey) for distributed rate limiting and shared coordination.
- Private order media: Cloudflare R2 with short-lived signed PUT/GET URLs, no-overwrite intent, and server-side size, magic-byte and SHA-256 verification.
- OTP/SMS: direct Unifonic adapter.
- Transactional password reset email: direct Resend adapter.
- Browser auth: opaque server-side sessions in HttpOnly cookies + CSRF token.
- Mobile auth: opaque session token via Authorization header, intended for OS secure storage.
- Admin MFA: TOTP is mandatory in staging/production.
- Admin operations dashboard: live customer/order KPIs plus explicit employee and technician permission grants.
- Audit and order-status history are append-only.
- Database migrations: checksum-verified, advisory-locked, manually launched through a protected GitHub environment before schema-dependent Render deployment.
- Render auto-deploy: only after GitHub checks pass.

This Free Stack is selected for staging and limited pilot validation. It is not a production-readiness claim.

## Optional future production architecture

The repository retains the reviewed Google Cloud path for a later production decision:

- Cloud Run
- Cloud SQL PostgreSQL with IAM database authentication
- Memorystore Redis
- private GCS media
- Regional Secret Manager
- Workload Identity Federation
- Terraform in `infra/gcp/`

GCP/CNTXT/Dammam is **not required** for the selected staging path.

## Non-negotiable gates

1. No runtime bootstrap-admin creation.
2. No local filesystem or instance-memory persistence as a system of record.
3. No Base64 media payloads through the API.
4. No sequential order number as an authentication factor.
5. No deployed environment without PostgreSQL, shared Redis, private object storage, encryption/HMAC keys and real OTP/email providers.
6. Preview/staging remains separate from the final production domain and data plane.
7. No deployment without the committed `package-lock.json`, Node.js 24 checks and Docker build gate.
8. No provider credentials committed to Git.
9. No mobile-store release before connected staging security acceptance.

## Local workflow

```bash
npm ci --ignore-scripts --no-audit --no-fund
cp .env.example .env
npm test
npm run check
npm run migrate
npm run bootstrap:admin
npm run start:api
```

`OTP_PROVIDER=log` and `EMAIL_PROVIDER=log` are local-development options only. Deployed staging refuses log providers.

## Staging

Primary references:

- `docs/STAGING_RUNBOOK.md`
- `docs/PHASE2B_CONNECTED_STAGING_CHECKLIST.md`
- `docs/PROVIDER_ACTIVATION.md`
- `infra/free/r2-cors.example.json`
- `render.yaml`

The selected free staging stack does not use or modify the existing Supabase projects. The legacy Vercel production deployment also remains untouched.
