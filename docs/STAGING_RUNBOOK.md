# Thiqah v1 staging runbook

This runbook converts the Phase 2 source into a real connected staging environment. It intentionally does not touch the legacy Vercel production deployment.

## 1. GitHub source gate

1. Create private repository `EslamElshikh-dev/thiqah-maintenance` with no starter README/license/gitignore.
2. Record its immutable numeric GitHub repository ID.
3. Generate `package-lock.json` on a trusted internet-connected machine using the exact `package.json`, then run:

```bash
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

4. Commit the reviewed lockfile. Do not bypass the CI lockfile gate.

## 2. GCP data-plane gate

All data-plane resources remain in `me-central2`:

- Cloud Run API/jobs
- Cloud SQL PostgreSQL
- Memorystore Redis
- Cloud Storage media
- Regional Secret Manager
- regional app Logging bucket

Create a regional Terraform state bucket first. Example operator commands:

```bash
export GCP_PROJECT_ID="your-project"
export TF_STATE_BUCKET="${GCP_PROJECT_ID}-thiqah-tfstate"

gcloud storage buckets create "gs://${TF_STATE_BUCKET}" \
  --project="${GCP_PROJECT_ID}" \
  --location=me-central2 \
  --uniform-bucket-level-access \
  --public-access-prevention \
  --soft-delete-duration=30d

gcloud storage buckets update "gs://${TF_STATE_BUCKET}" --versioning
```

Then:

```bash
cd infra/gcp/terraform
cp backend.tf.example backend.tf
cp backend.hcl.example backend.hcl
# edit backend.hcl and staging.tfvars
terraform init -backend-config=backend.hcl
terraform fmt -check
terraform validate
terraform plan -var-file=staging.tfvars -out=staging.tfplan
terraform show staging.tfplan
# Apply only after manual review.
terraform apply staging.tfplan
```

Never commit `backend.hcl`, state, plans, or generated credentials.

## 3. Regional secrets gate

From a trusted operator workstation authenticated to the staging GCP project:

```bash
export GCP_PROJECT_ID="your-project"
export GCP_REGION="me-central2"
export APP_ENV="staging"

# Supply the real provider endpoints separately; the script generates the
# cryptographic/runtime tokens itself and reads Redis connection material.
scripts/gcp/provision-runtime-secrets.sh
```

For the one-time owner bootstrap, set a strong temporary password and a pre-generated TOTP secret only in the operator shell, run the provisioning script again to add those two versions, and clear shell/history according to your operator policy. The protected bootstrap workflow destroys those versions after success.

## 4. GitHub OIDC gate

Populate the `staging` and `staging-bootstrap` environments using `docs/GITHUB_ENVIRONMENT_VARIABLES.md`.

No `GOOGLE_APPLICATION_CREDENTIALS`, service-account JSON key, Vercel token, database password, Redis password, or runtime secret belongs in GitHub.

## 5. First connected deployment

Push/merge the reviewed Phase 2 source and lockfile to `main`.

`Deploy Staging` then performs:

1. lockfile requirement
2. `npm ci`
3. unit/syntax/config gates
4. GitHub OIDC -> GCP WIF
5. immutable Docker build + SBOM/provenance
6. push to Dammam Artifact Registry
7. one-shot database release job
8. Cloud Run API deploy using the same image digest
9. `/health/live` and `/health/ready` smoke tests

Do not bootstrap an owner until readiness passes.

## 6. One-time owner bootstrap

Run `Bootstrap Staging Owner` manually with `confirm=BOOTSTRAP` through the protected `staging-bootstrap` environment. After successful creation the workflow destroys the bootstrap password/TOTP secret versions and deletes the temporary Cloud Run Job.

Then verify MFA login and ensure no bootstrap credentials remain enabled.

## 7. Security acceptance before mobile work

Before starting Android/iOS packaging, run the planned E2E/security suite against staging:

- customer A cannot read/update customer B resources
- technician can see only active assigned jobs
- admin state changes require MFA-authenticated session
- CSRF protection on browser mutations
- reset tokens are single-use and short-lived
- tracking token cannot be enumerated from order number
- rate limits on auth/OTP/tracking/order creation
- upload signed URL cannot overwrite an existing object
- uploaded bytes must match allowed magic bytes, size and SHA-256
- account deletion actually revokes sessions and handles media/retention as documented
- database restore/PITR test succeeds

Only then open the Capacitor/mobile release gate.
