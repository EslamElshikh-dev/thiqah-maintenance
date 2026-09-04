# Thiqah v1 staging runbook

This runbook starts from the current GitHub state and converts the staging-ready source into a real connected Dammam environment. It intentionally does not touch the legacy Vercel production deployment.

## 1. Source gate — complete

Current state:

- repository exists at `EslamElshikh-dev/thiqah-maintenance`
- Phase 2 remains isolated in `feat/phase2-connected-staging`
- PR #1 remains Draft
- `package-lock.json` is committed
- Node.js 24 `npm ci` and application checks pass in GitHub Actions
- production Docker image build passes in CI
- no live credentials or customer data are committed

Do not merge PR #1 solely to start infrastructure. Keep the source reviewable until connected staging is ready.

## 2. CNTXT / GCP Dammam gate

For a KSA-billed Google Cloud account, complete the applicable CNTXT onboarding/access path for Dammam `me-central2` first.

All Thiqah staging data-plane resources remain in `me-central2`:

- Cloud Run API/jobs
- Cloud SQL PostgreSQL
- Memorystore Redis
- private Cloud Storage media
- Regional Secret Manager
- regional application Logging bucket

Create the regional Terraform state bucket from a trusted operator environment:

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

Then review and apply Terraform:

```bash
cd infra/gcp/terraform
cp backend.tf.example backend.tf
cp backend.hcl.example backend.hcl
cp staging.tfvars.example staging.tfvars
# Fill project/account/repository values locally only.
terraform init -backend-config=backend.hcl
terraform fmt -check
terraform validate
terraform plan -var-file=staging.tfvars -out=staging.tfplan
terraform show staging.tfplan
# Apply only after manual review.
terraform apply staging.tfplan
```

Never commit `backend.hcl`, `staging.tfvars`, state, plans, or generated credentials.

## 3. Messaging provider gate

The code now contains tested direct adapters for:

- Unifonic — SMS/OTP
- Resend — transactional password-reset email

Before selecting the direct adapters in a deployed environment:

1. activate a Unifonic account and create an AppSid
2. obtain approval for the actual Sender ID
3. verify the Resend sender domain/address
4. create a sending-only Resend API key
5. store provider credentials only as Regional Secret Manager versions

Until the regional provider-secret loading switch is reviewed/applied, the deployed staging configuration remains on the existing Webhook adapters. Do not work around this by placing provider credentials in GitHub variables.

## 4. Regional runtime secrets

From a trusted operator environment authenticated to the staging GCP project:

```bash
export GCP_PROJECT_ID="your-project"
export GCP_REGION="me-central2"
export APP_ENV="staging"
scripts/gcp/provision-runtime-secrets.sh
```

For the one-time owner bootstrap, provide the temporary password and pre-generated TOTP seed only in the trusted operator shell. The protected bootstrap workflow must destroy those secret versions after success.

## 5. GitHub OIDC/WIF gate

Populate protected `staging` and `staging-bootstrap` GitHub environments using `docs/GITHUB_ENVIRONMENT_VARIABLES.md` and reviewed Terraform outputs.

No service-account JSON key, database password, Redis password, provider API key, AppSid, Vercel token, or runtime application secret belongs in GitHub.

## 6. First connected deployment

After Terraform, WIF, secrets and provider endpoints are ready, merge the reviewed staging source as appropriate and run `Deploy Staging`.

The workflow performs:

1. committed lockfile requirement
2. `npm ci`
3. unit/syntax/config gates
4. GitHub OIDC -> GCP WIF
5. immutable Docker build + SBOM/provenance
6. push to Dammam Artifact Registry
7. one-shot database release job
8. Cloud Run staging API deploy using the same image digest
9. `/health/live` and `/health/ready` smoke tests

Do not bootstrap an owner until readiness passes.

## 7. One-time owner bootstrap

Run `Bootstrap Staging Owner` manually with `confirm=BOOTSTRAP` through the protected `staging-bootstrap` environment. After successful creation the workflow destroys the bootstrap password/TOTP secret versions and deletes the temporary Cloud Run Job.

Verify MFA login and confirm no bootstrap credential versions remain usable.

## 8. Security acceptance before mobile work

Complete `docs/PHASE2B_CONNECTED_STAGING_CHECKLIST.md`, including:

- customer A cannot read/update customer B resources
- technician can see only active assigned jobs
- admin MFA and replay protection
- CSRF protection on browser mutations
- reset tokens are single-use and short-lived
- tracking token cannot be enumerated from order number
- rate limits on auth/OTP/tracking/order creation
- upload signed URL cannot overwrite an existing object
- uploaded bytes must match allowed magic bytes, size and SHA-256
- account deletion revokes sessions and applies retention rules
- database restore/PITR drill succeeds

Only then open the Capacitor Android/iOS release gate.
