# GCP Dammam staging deployment

Target region: `me-central2` (Dammam).

For a Saudi billing address, complete the applicable Google Cloud/CNTXT Dammam access path before applying Terraform.

## Architecture decisions

- Cloud Run uses **Direct VPC egress** to the dedicated subnetwork. No Serverless VPC Access connector is created.
- Cloud SQL has private IP only and `cloudsql.iam_authentication=on`.
- The API and migrator use automatic IAM database authentication; no PostgreSQL password is stored in Terraform or Cloud Run.
- Redis uses AUTH and TLS over the private VPC.
- Media lives in a private regional GCS bucket with uniform bucket-level access and public-access prevention.
- Cloud Run's runtime service account signs short-lived upload URLs using Google-managed `signBlob`; no service-account private key exists.
- Secrets are **Regional Secret Manager** resources in `me-central2`. Cloud Run cannot directly attach regional secrets, so the application fetches them from the regional Secret Manager endpoint at startup.
- App logs are routed to a regional Logging bucket for the staging service.
- GitHub deploys with Workload Identity Federation and short-lived OIDC credentials only.

## Provisioning order

1. Create/select the GCP project with Dammam access.
2. Create a dedicated regional GCS bucket for Terraform remote state. Enable uniform bucket-level access, public-access prevention, versioning, and soft-delete protection.
3. Copy `backend.tf.example` to `backend.tf` and initialize Terraform with a reviewed backend config.
4. Create the private GitHub repository first and obtain its immutable numeric repository ID.
5. Copy `staging.tfvars.example`, fill the project/repository IDs, then run `terraform fmt -check`, `terraform validate`, `terraform plan` and manually review the plan.
6. Apply Terraform from a trusted operator environment.
7. Run `scripts/gcp/provision-runtime-secrets.sh` from a trusted authenticated workstation to add regional secret versions. Never write the generated values into Terraform state or GitHub variables.
8. Configure the `staging` and `staging-bootstrap` GitHub environments using `docs/GITHUB_ENVIRONMENT_VARIABLES.md`.
9. Commit a trustworthy `package-lock.json`; CI and deployment intentionally fail without it.
10. Merge to `main`. The staging workflow builds an immutable image, runs the database release job, deploys Cloud Run, and runs live/readiness smoke checks.
11. Run `Bootstrap Staging Owner` exactly once through the protected `staging-bootstrap` environment. Its workflow destroys the one-time bootstrap secret versions immediately afterward.

## Runtime principles

- region: `me-central2`
- Cloud Run API SA: Terraform output `api_service_account`
- migrator SA: Terraform output `migrator_service_account`
- ingress: public HTTPS for the API; application authentication/RBAC/MFA protects private operations
- Direct VPC egress: `private-ranges-only`
- staging min instances: `0`; production may use `1+` after load/cost testing
- concurrency: start at `40`
- normal request timeout: `30s`
- no local persistent storage assumptions
- no private media proxy through Vercel

## Terraform state

`backend.tf.example` is intentionally not activated in source because the final state bucket name is account-specific. Never commit state files or a backend config containing credentials.
