import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const SECRET_SETS = Object.freeze({
  runtime: Object.freeze({
    SESSION_HMAC_KEY: 'session-hmac-key',
    PII_HASH_KEY: 'pii-hash-key',
    MFA_ENCRYPTION_KEY_BASE64: 'mfa-encryption-key',
    TOKEN_ENCRYPTION_KEY_BASE64: 'token-encryption-key',
    REDIS_URL: 'redis-url',
    REDIS_CA_CERT_BASE64: 'redis-ca-cert-base64',
    SMS_WEBHOOK_BEARER_TOKEN: 'sms-webhook-bearer-token',
    EMAIL_WEBHOOK_BEARER_TOKEN: 'email-webhook-bearer-token'
  }),
  bootstrap: Object.freeze({
    MFA_ENCRYPTION_KEY_BASE64: 'mfa-encryption-key',
    ADMIN_BOOTSTRAP_PASSWORD: 'admin-bootstrap-password',
    ADMIN_BOOTSTRAP_TOTP_SECRET: 'admin-bootstrap-totp-secret'
  })
});

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function secretName(projectId, location, prefix, suffix) {
  return `projects/${projectId}/locations/${location}/secrets/${prefix}-${suffix}/versions/latest`;
}

export async function hydrateRegionalSecrets(setName) {
  const bindings = SECRET_SETS[setName];
  if (!bindings) throw new Error(`Unknown regional secret set: ${setName}`);

  const projectId = requiredEnv('GCP_PROJECT_ID');
  const location = requiredEnv('REGIONAL_SECRET_LOCATION');
  const prefix = requiredEnv('REGIONAL_SECRET_PREFIX');
  if (location !== 'me-central2') {
    throw new Error('REGIONAL_SECRET_LOCATION must be me-central2 for Thiqah deployed environments');
  }

  const client = new SecretManagerServiceClient({
    apiEndpoint: `secretmanager.${location}.rep.googleapis.com`
  });

  try {
    for (const [envName, suffix] of Object.entries(bindings)) {
      if (process.env[envName]) continue;
      const [version] = await client.accessSecretVersion({
        name: secretName(projectId, location, prefix, suffix)
      });
      const payload = version.payload?.data;
      if (!payload) throw new Error(`Regional secret has no payload: ${prefix}-${suffix}`);
      process.env[envName] = Buffer.from(payload).toString('utf8');
    }
  } finally {
    await client.close();
  }
}
