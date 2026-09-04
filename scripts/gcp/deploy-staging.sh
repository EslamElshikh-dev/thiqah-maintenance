#!/usr/bin/env bash
set -euo pipefail

required=(
  GCP_PROJECT_ID GCP_REGION GCP_IMAGE GCP_NETWORK GCP_SUBNETWORK
  GCP_RUNTIME_SERVICE_ACCOUNT GCP_MIGRATOR_SERVICE_ACCOUNT
  CLOUD_SQL_INSTANCE_CONNECTION_NAME RUNTIME_IAM_DB_USER MIGRATOR_IAM_DB_USER
  GCS_BUCKET STAGING_PUBLIC_APP_ORIGINS SMS_WEBHOOK_URL EMAIL_WEBHOOK_URL SUPPORT_FROM_EMAIL
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then echo "$name is required" >&2; exit 1; fi
done
if [[ "$GCP_REGION" != "me-central2" ]]; then echo "GCP_REGION must be me-central2" >&2; exit 1; fi

APP_NAME="${APP_NAME:-thiqah}"
APP_ENV="staging"
PREFIX="${APP_NAME}-${APP_ENV}"
SERVICE_NAME="${PREFIX}-api"
DB_JOB="${PREFIX}-db-release"

DB_ENV_FILE="$(mktemp)"
RUNTIME_ENV_FILE="$(mktemp)"
trap 'rm -f "$DB_ENV_FILE" "$RUNTIME_ENV_FILE"' EXIT

DB_ENV_FILE="$DB_ENV_FILE" python3 - <<'PYENV'
import json, os
values = {
  "NODE_ENV": "production",
  "APP_ENV": "staging",
  "DATABASE_MODE": "cloudsql-iam",
  "CLOUD_SQL_INSTANCE_CONNECTION_NAME": os.environ["CLOUD_SQL_INSTANCE_CONNECTION_NAME"],
  "CLOUD_SQL_IAM_DB_USER": os.environ["MIGRATOR_IAM_DB_USER"],
  "CLOUD_SQL_IP_TYPE": "PRIVATE",
  "DB_NAME": "thiqah",
  "DB_POOL_MAX": "1",
  "RUNTIME_IAM_DB_USER": os.environ["RUNTIME_IAM_DB_USER"]
}
open(os.environ["DB_ENV_FILE"], "w").write(json.dumps(values))
PYENV

RUNTIME_ENV_FILE="$RUNTIME_ENV_FILE" PREFIX="$PREFIX" python3 - <<'PYENV'
import json, os
values = {
  "NODE_ENV": "production",
  "APP_ENV": "staging",
  "PUBLIC_APP_ORIGINS": os.environ["STAGING_PUBLIC_APP_ORIGINS"],
  "DATABASE_MODE": "cloudsql-iam",
  "CLOUD_SQL_INSTANCE_CONNECTION_NAME": os.environ["CLOUD_SQL_INSTANCE_CONNECTION_NAME"],
  "CLOUD_SQL_IAM_DB_USER": os.environ["RUNTIME_IAM_DB_USER"],
  "CLOUD_SQL_IP_TYPE": "PRIVATE",
  "DB_NAME": "thiqah",
  "DB_POOL_MAX": "5",
  "GCS_BUCKET": os.environ["GCS_BUCKET"],
  "GCP_PROJECT_ID": os.environ["GCP_PROJECT_ID"],
  "REGIONAL_SECRET_LOCATION": os.environ["GCP_REGION"],
  "REGIONAL_SECRET_PREFIX": os.environ["PREFIX"],
  "OTP_PROVIDER": "webhook",
  "SMS_SENDER_ID": "THIQAH",
  "SMS_WEBHOOK_URL": os.environ["SMS_WEBHOOK_URL"],
  "EMAIL_PROVIDER": "webhook",
  "EMAIL_WEBHOOK_URL": os.environ["EMAIL_WEBHOOK_URL"],
  "SUPPORT_FROM_EMAIL": os.environ["SUPPORT_FROM_EMAIL"],
  "SESSION_COOKIE_SAME_SITE": "lax"
}
open(os.environ["RUNTIME_ENV_FILE"], "w").write(json.dumps(values))
PYENV

gcloud run jobs deploy "$DB_JOB" \
  --project="$GCP_PROJECT_ID" \
  --region="$GCP_REGION" \
  --image="$GCP_IMAGE" \
  --service-account="$GCP_MIGRATOR_SERVICE_ACCOUNT" \
  --network="$GCP_NETWORK" \
  --subnet="$GCP_SUBNETWORK" \
  --vpc-egress=private-ranges-only \
  --tasks=1 \
  --max-retries=0 \
  --task-timeout=10m \
  --memory=512Mi \
  --cpu=1 \
  --args=apps/api/src/scripts/release-db.js \
  --env-vars-file="$DB_ENV_FILE" \
  --quiet

gcloud run jobs execute "$DB_JOB" --project="$GCP_PROJECT_ID" --region="$GCP_REGION" --wait --quiet

gcloud run deploy "$SERVICE_NAME" \
  --project="$GCP_PROJECT_ID" \
  --region="$GCP_REGION" \
  --image="$GCP_IMAGE" \
  --service-account="$GCP_RUNTIME_SERVICE_ACCOUNT" \
  --network="$GCP_NETWORK" \
  --subnet="$GCP_SUBNETWORK" \
  --vpc-egress=private-ranges-only \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --concurrency=40 \
  --min=0 \
  --max=5 \
  --timeout=30s \
  --env-vars-file="$RUNTIME_ENV_FILE" \
  --labels="app=thiqah,environment=staging,data-region=me-central2" \
  --quiet

SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --project="$GCP_PROJECT_ID" --region="$GCP_REGION" --format='value(status.url)')"
node scripts/smoke-api.mjs "$SERVICE_URL"
echo "Staging API deployed and passed smoke checks: $SERVICE_URL"
