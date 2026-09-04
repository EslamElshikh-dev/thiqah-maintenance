#!/usr/bin/env bash
set -euo pipefail

required=(
  GCP_PROJECT_ID GCP_REGION GCP_NETWORK GCP_SUBNETWORK GCP_MIGRATOR_SERVICE_ACCOUNT
  CLOUD_SQL_INSTANCE_CONNECTION_NAME MIGRATOR_IAM_DB_USER
  ADMIN_BOOTSTRAP_USERNAME ADMIN_BOOTSTRAP_EMAIL ADMIN_BOOTSTRAP_DISPLAY_NAME
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then echo "$name is required" >&2; exit 1; fi
done
if [[ "$GCP_REGION" != "me-central2" ]]; then echo "GCP_REGION must be me-central2" >&2; exit 1; fi

APP_NAME="${APP_NAME:-thiqah}"
PREFIX="${APP_NAME}-staging"
SERVICE_NAME="${PREFIX}-api"
BOOTSTRAP_JOB="${PREFIX}-owner-bootstrap"

IMAGE="$(gcloud run services describe "$SERVICE_NAME" \
  --project="$GCP_PROJECT_ID" --region="$GCP_REGION" \
  --format='value(spec.template.spec.containers[0].image)')"
if [[ -z "$IMAGE" ]]; then echo "No deployed staging image found" >&2; exit 1; fi

ENV_FILE="$(mktemp)"
trap 'rm -f "$ENV_FILE"' EXIT
ENV_FILE="$ENV_FILE" PREFIX="$PREFIX" python3 - <<'PYENV'
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
  "GCP_PROJECT_ID": os.environ["GCP_PROJECT_ID"],
  "REGIONAL_SECRET_LOCATION": os.environ["GCP_REGION"],
  "REGIONAL_SECRET_PREFIX": os.environ["PREFIX"],
  "ADMIN_BOOTSTRAP_USERNAME": os.environ["ADMIN_BOOTSTRAP_USERNAME"],
  "ADMIN_BOOTSTRAP_EMAIL": os.environ["ADMIN_BOOTSTRAP_EMAIL"],
  "ADMIN_BOOTSTRAP_DISPLAY_NAME": os.environ["ADMIN_BOOTSTRAP_DISPLAY_NAME"]
}
open(os.environ["ENV_FILE"], "w").write(json.dumps(values))
PYENV

gcloud run jobs deploy "$BOOTSTRAP_JOB" \
  --project="$GCP_PROJECT_ID" \
  --region="$GCP_REGION" \
  --image="$IMAGE" \
  --service-account="$GCP_MIGRATOR_SERVICE_ACCOUNT" \
  --network="$GCP_NETWORK" \
  --subnet="$GCP_SUBNETWORK" \
  --vpc-egress=private-ranges-only \
  --tasks=1 \
  --max-retries=0 \
  --task-timeout=5m \
  --memory=512Mi \
  --cpu=1 \
  --args=apps/api/src/scripts/bootstrap-admin.js \
  --env-vars-file="$ENV_FILE" \
  --quiet

gcloud run jobs execute "$BOOTSTRAP_JOB" --project="$GCP_PROJECT_ID" --region="$GCP_REGION" --wait --quiet

echo "Owner bootstrap succeeded. Destroy the two bootstrap secret versions now."
