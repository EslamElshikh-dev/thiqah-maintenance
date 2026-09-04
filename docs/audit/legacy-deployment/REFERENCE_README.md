# Thiqah v1 Production Reference Pack

Generated: 2026-09-04

This pack is a production-readiness reference reconstructed from the live Vercel deployment and authenticated Vercel runtime/build evidence. It is intentionally **not** represented as the original source repository: server-only source files are not downloadable through the currently connected Vercel tooling.

## Deployment under review

- Project: `thiqah-maintenance-sa-preview`
- Vercel project ID: `prj_k4qO3u6zVtsKJeQPk9seUoOHsFEb`
- Production deployment: `dpl_J2A3sprMfuM7odvm5uZrsMb9Rnpv`
- Public alias: `https://thiqah-maintenance-sa-preview.vercel.app/`
- Compute region: `iad1` (Washington, D.C.)
- Deployment type: `LAMBDAS`
- Build evidence: Vercel downloaded 45 deployment files; one Node.js Lambda runtime.

## Contents

- `audit/THIQAH_V1_PRODUCTION_AUDIT.md` — severity-ranked Backend/Security review
- `audit/API_INVENTORY.md` — client-discovered API surface and authorization expectations
- `audit/SECURITY_TEST_PLAN.md` — release-blocking abuse/BOLA/auth/upload tests
- `audit/RECOVERY_MANIFEST.md` — what is recovered/verified vs not retrievable
- `audit/MOBILE_RELEASE_GATE.md` — Android/iOS packaging gate
- `audit/ARCHITECTURE.md` — recommended Saudi production architecture
- `db/001_thiqah_v1_schema.sql` — proposed PostgreSQL v1 schema, not applied anywhere

## Non-negotiable rule

Do not deploy this reference pack over the current site. First create the dedicated private GitHub repository, restore/rebuild the server source, migrate persistence to a durable database/object store, and pass the security gates.
