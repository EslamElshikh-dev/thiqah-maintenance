# Phase 2 release notes — staging-ready source

Release label: `thiqah-v1-phase2-staging-ready`.

This release does **not** modify or replace the legacy Vercel deployment. It prepares the clean v1 source for a connected Dammam staging environment.

## Security and reliability changes

- Node engine pinned to 24.x; Docker runtime is distroless non-root.
- GitHub Actions use exact action commit SHAs and GitHub OIDC -> GCP Workload Identity Federation.
- WIF trust is constrained by immutable GitHub repository/owner IDs, `main`, and approved workflow paths.
- Cloud SQL uses automatic IAM database authentication over private IP.
- Cloud Run uses Direct VPC egress instead of a VPC connector.
- Runtime secrets are Regional Secret Manager resources in `me-central2` and are fetched via the regional API endpoint at startup.
- Redis uses AUTH + TLS.
- App logs are routed to a regional Logging bucket.
- Browser sessions are HttpOnly + CSRF; proxy trust is limited to one hop.
- Invalid UUID/phone/password/date/timestamp/integer inputs fail as client errors instead of surfacing PostgreSQL/internal 500s.
- OTP issuance serializes per phone/purpose, retires older challenges, uses constant-time hash comparison, and OTP consumption can participate in the caller transaction.
- Customer registration consumes OTP and creates the account/session atomically.
- Guest and authenticated order creation now combine idempotency and order creation in one database transaction.
- Technician assignments are released and technician availability is restored atomically on rollback/cancel/completion.
- Admin TOTP is mandatory in deployed environments and the same TOTP code cannot be replayed.
- Media upload kinds are role- and order-state constrained.
- Signed uploads require `x-goog-if-generation-match: 0`, preventing overwrite reuse.
- Uploaded media is streamed back from private storage and validated by actual magic bytes, size and SHA-256 before database registration.
- Private media reads require RBAC and receive a five-minute signed read URL.
- Phase 1 migrations 001–004 remain byte-for-byte immutable; the runner strips only their outer transaction wrappers at execution time while checking original checksums.

## Validation performed in this environment

- `npm run check`: 13/13 tests passing.
- JavaScript syntax gate: 40 application files in `npm run check`, plus an independent release sweep over 47 JS/MJS files: passing.
- GitHub workflow YAML parse: passing.
- GCP shell scripts `bash -n`: passing.
- staging configuration gate with representative values: passing.
- `git diff --check`: passing.
- migrations 001–004 verified unchanged from Phase 1.

Local test execution used Node 22.16.0 because Node 24 is not installed in this execution container. CI is explicitly pinned to Node 24 and must rerun the same gates after a trustworthy `package-lock.json` is generated.

Terraform CLI is not installed in this execution environment, so `terraform validate` cannot be honestly claimed here. The connected staging runbook requires `terraform fmt -check`, `terraform validate` and a manually reviewed plan before apply.

## External blockers before “connected staging” can be claimed

1. Create private GitHub repository `EslamElshikh-dev/thiqah-maintenance` and record its immutable numeric repository ID.
2. Generate and review `package-lock.json` from a trusted npm-connected environment.
3. Obtain/configure the GCP Dammam/CNTXT project path.
4. Create the remote Terraform state bucket and run Terraform validation/plan/apply from an authorized environment.
5. Configure real SMS and email adapter endpoints.
6. Deploy staging, pass live/readiness and E2E/security acceptance, then bootstrap the owner once.
