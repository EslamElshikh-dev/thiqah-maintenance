# Thiqah v1 Production

Production rebuild of **ثقة للصيانة المنزلية**. This repository intentionally does **not** treat the current Vercel preview backend as a production source of truth.

## Architecture

- Static/PWA web and future Capacitor clients.
- API: Node.js 24 + Fastify on Cloud Run in `me-central2` (Dammam).
- Database: PostgreSQL 17 / Cloud SQL private IP in `me-central2`, using automatic IAM database authentication.
- Rate limiting and short-lived coordination: Redis / Memorystore in `me-central2` with AUTH + TLS.
- Private order media: Google Cloud Storage regional bucket in `me-central2`, direct short-lived signed uploads, server-side magic-byte and SHA-256 verification.
- Runtime secrets: Regional Secret Manager in `me-central2`, fetched directly by the API at startup through the regional endpoint. Cloud Run receives secret identifiers only, not secret values.
- Browser auth: opaque server-side sessions in HttpOnly cookies + CSRF token.
- Mobile auth: same opaque session token via Authorization header, stored in OS secure storage.
- Admin MFA: TOTP is mandatory in staging/production.
- Audit and order status history are append-only.
- GitHub Actions deployment: GitHub OIDC -> Google Cloud Workload Identity Federation; no stored GCP service-account key.

## Non-negotiable production gates

1. No runtime bootstrap admin creation.
2. No local filesystem persistence.
3. No Base64 image payloads through the API.
4. No sequential order number as an authentication factor.
5. No production start without PostgreSQL, Redis, private object storage, MFA/token encryption keys, and real OTP/email providers.
6. Preview/staging is `noindex`; production canonical/sitemap use the final custom domain.
7. No staging or production deployment without a reviewed `package-lock.json` and `npm ci`.
8. No direct push-based deployment using long-lived Google Cloud credentials.

## Local workflow

```bash
npm install
cp .env.example .env
npm test
npm run check
npm run migrate
npm run bootstrap:admin
npm run start:api
```

`OTP_PROVIDER=log` and `EMAIL_PROVIDER=log` are local-development options only. Staging/production use webhook providers and refuse insecure configuration.

## Staging

See:

- `docs/STAGING_RUNBOOK.md`
- `docs/GITHUB_ENVIRONMENT_VARIABLES.md`
- `infra/gcp/README.md`

The staging source is considered **staging-ready**, not deployed, until the private GitHub repository exists, a trustworthy lockfile is committed, and the GCP Dammam project is connected/provisioned.
