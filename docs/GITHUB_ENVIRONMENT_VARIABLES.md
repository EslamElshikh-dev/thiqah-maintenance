# GitHub environment variables for staging

Create two protected GitHub environments: `staging` and `staging-bootstrap`.

Prefer required reviewers on `staging-bootstrap`. Do not store Google Cloud JSON keys or runtime application secrets in GitHub.

## `staging` variables

Set these GitHub **environment variables** from the reviewed Terraform outputs/configuration:

| Variable | Source |
|---|---|
| `GCP_PROJECT_ID` | GCP project ID |
| `GCP_REGION` | `me-central2` |
| `GCP_ARTIFACT_REPOSITORY` | Terraform `artifact_repository` |
| `GCP_RUNTIME_SERVICE_ACCOUNT` | Terraform `api_service_account` |
| `GCP_MIGRATOR_SERVICE_ACCOUNT` | Terraform `migrator_service_account` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Terraform `workload_identity_provider` |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | Terraform `deploy_service_account` |
| `GCP_NETWORK` | Terraform `network` |
| `GCP_SUBNETWORK` | Terraform `subnetwork` |
| `CLOUD_SQL_INSTANCE_CONNECTION_NAME` | Terraform `database_instance_connection_name` |
| `RUNTIME_IAM_DB_USER` | Terraform `runtime_iam_db_user` |
| `MIGRATOR_IAM_DB_USER` | Terraform `migrator_iam_db_user` |
| `GCS_BUCKET` | Terraform `media_bucket` |
| `STAGING_PUBLIC_APP_ORIGINS` | HTTPS staging frontend origin(s), comma separated |
| `SMS_WEBHOOK_URL` | HTTPS SMS adapter endpoint |
| `EMAIL_WEBHOOK_URL` | HTTPS email adapter endpoint |
| `SUPPORT_FROM_EMAIL` | verified staging sender address |

The webhook bearer tokens are **not** GitHub variables. They are Regional Secret Manager secret versions provisioned by the operator script.

## `staging-bootstrap` variables

Use the common Google Cloud/database variables needed by `.github/workflows/bootstrap-staging-owner.yml`:

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_DEPLOY_SERVICE_ACCOUNT`
- `GCP_MIGRATOR_SERVICE_ACCOUNT`
- `GCP_NETWORK`
- `GCP_SUBNETWORK`
- `CLOUD_SQL_INSTANCE_CONNECTION_NAME`
- `MIGRATOR_IAM_DB_USER`

Owner username/email/display name are workflow-dispatch inputs. Password and TOTP seed are one-time Regional Secret Manager versions, never workflow inputs.

## WIF trust boundary

Terraform binds GitHub OIDC to the immutable repository ID and owner ID, the `main` ref, and exactly the two approved workflow paths. If the repository is recreated, update `github_repository_id` and re-review the Terraform plan before deployment can authenticate.
