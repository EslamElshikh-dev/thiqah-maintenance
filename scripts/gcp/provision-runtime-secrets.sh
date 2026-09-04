#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
GCP_REGION="${GCP_REGION:-me-central2}"
APP_NAME="${APP_NAME:-thiqah}"
APP_ENV="${APP_ENV:-staging}"
PREFIX="${APP_NAME}-${APP_ENV}"
REDIS_INSTANCE="${PREFIX}-redis"

if [[ "${GCP_REGION}" != "me-central2" ]]; then
  echo "Refusing to provision Thiqah runtime secrets outside me-central2" >&2
  exit 1
fi

add_secret_version() {
  local secret_id="$1"
  local value="$2"
  printf '%s' "$value" | gcloud secrets versions add "$secret_id" \
    --project="$GCP_PROJECT_ID" \
    --location="$GCP_REGION" \
    --data-file=- >/dev/null
}

gcloud config set project "$GCP_PROJECT_ID" >/dev/null
gcloud config set api_endpoint_overrides/secretmanager "https://secretmanager.${GCP_REGION}.rep.googleapis.com/" >/dev/null

SESSION_HMAC_KEY="$(openssl rand -hex 32)"
PII_HASH_KEY="$(openssl rand -hex 32)"
MFA_KEY="$(openssl rand -base64 32 | tr -d '\n')"
TOKEN_KEY="$(openssl rand -base64 32 | tr -d '\n')"
SMS_ADAPTER_TOKEN="$(openssl rand -hex 32)"
EMAIL_ADAPTER_TOKEN="$(openssl rand -hex 32)"

REDIS_AUTH="$(gcloud redis instances get-auth-string "$REDIS_INSTANCE" --region="$GCP_REGION" --format='value(authString)')"
REDIS_HOST="$(gcloud redis instances describe "$REDIS_INSTANCE" --region="$GCP_REGION" --format='value(host)')"
REDIS_PORT="$(gcloud redis instances describe "$REDIS_INSTANCE" --region="$GCP_REGION" --format='value(port)')"
REDIS_AUTH_ESCAPED="$(REDIS_AUTH="$REDIS_AUTH" python3 - <<'PY'
import os, urllib.parse
print(urllib.parse.quote(os.environ['REDIS_AUTH'], safe=''))
PY
)"
REDIS_URL="rediss://:${REDIS_AUTH_ESCAPED}@${REDIS_HOST}:${REDIS_PORT}"
REDIS_CA_CERT_BASE64="$(gcloud redis instances describe "$REDIS_INSTANCE" --region="$GCP_REGION" --format='value(serverCaCerts[0].cert)' | base64 | tr -d '\n')"

add_secret_version "${PREFIX}-session-hmac-key" "$SESSION_HMAC_KEY"
add_secret_version "${PREFIX}-pii-hash-key" "$PII_HASH_KEY"
add_secret_version "${PREFIX}-mfa-encryption-key" "$MFA_KEY"
add_secret_version "${PREFIX}-token-encryption-key" "$TOKEN_KEY"
add_secret_version "${PREFIX}-redis-url" "$REDIS_URL"
add_secret_version "${PREFIX}-redis-ca-cert-base64" "$REDIS_CA_CERT_BASE64"
add_secret_version "${PREFIX}-sms-webhook-bearer-token" "$SMS_ADAPTER_TOKEN"
add_secret_version "${PREFIX}-email-webhook-bearer-token" "$EMAIL_ADAPTER_TOKEN"

if [[ -n "${ADMIN_BOOTSTRAP_PASSWORD:-}" && -n "${ADMIN_BOOTSTRAP_TOTP_SECRET:-}" ]]; then
  add_secret_version "${PREFIX}-admin-bootstrap-password" "$ADMIN_BOOTSTRAP_PASSWORD"
  add_secret_version "${PREFIX}-admin-bootstrap-totp-secret" "$ADMIN_BOOTSTRAP_TOTP_SECRET"
  echo "Bootstrap secret versions added. Destroy those versions immediately after the one-time owner bootstrap."
else
  echo "Bootstrap secrets skipped. Set ADMIN_BOOTSTRAP_PASSWORD and ADMIN_BOOTSTRAP_TOTP_SECRET only for the one-time bootstrap step."
fi

unset SESSION_HMAC_KEY PII_HASH_KEY MFA_KEY TOKEN_KEY SMS_ADAPTER_TOKEN EMAIL_ADAPTER_TOKEN
unset REDIS_AUTH REDIS_AUTH_ESCAPED REDIS_URL REDIS_CA_CERT_BASE64

echo "Regional runtime secret versions provisioned for ${PREFIX} in ${GCP_REGION}."
