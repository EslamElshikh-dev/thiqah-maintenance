function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(name, fallback = '') {
  return process.env[name] || fallback;
}

function parseOrigins(value) {
  const origins = String(value || '')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (!origins.length) return ['http://localhost:3000'];
  for (const origin of origins) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash) {
      throw new Error(`Invalid PUBLIC_APP_ORIGINS entry: ${origin}`);
    }
  }
  return [...new Set(origins)];
}

function integer(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function validateUpstashRestUrl(value) {
  if (!value) return;
  const url = new URL(value);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.upstash.io') || url.username || url.password) {
    throw new Error('UPSTASH_REDIS_REST_URL must be an HTTPS Upstash endpoint');
  }
}

function validateR2WorkerUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['/', ''].includes(url.pathname)) {
    throw new Error('R2_WORKER_URL must be an HTTPS service origin without credentials, query, hash, or path');
  }
}

export function loadDatabaseConfig() {
  const nodeEnv = optional('NODE_ENV', 'development');
  const appEnv = optional('APP_ENV', nodeEnv === 'production' ? 'production' : 'development');
  if (!['development', 'test', 'staging', 'production'].includes(appEnv)) throw new Error('APP_ENV must be development, test, staging, or production');
  const databaseMode = optional('DATABASE_MODE', 'url');
  if (!['url', 'cloudsql-iam'].includes(databaseMode)) throw new Error('DATABASE_MODE must be url or cloudsql-iam');
  const config = {
    nodeEnv,
    appEnv,
    isDeployed: appEnv === 'staging' || appEnv === 'production',
    databaseMode,
    databaseUrl: optional('DATABASE_URL'),
    cloudSqlInstanceConnectionName: optional('CLOUD_SQL_INSTANCE_CONNECTION_NAME'),
    cloudSqlIamDbUser: optional('CLOUD_SQL_IAM_DB_USER'),
    cloudSqlIpType: optional('CLOUD_SQL_IP_TYPE', 'PRIVATE').toUpperCase(),
    dbName: optional('DB_NAME', 'thiqah'),
    dbPoolMax: integer('DB_POOL_MAX', 5, { min: 1, max: 50 })
  };
  if (!['PRIVATE', 'PUBLIC', 'PSC'].includes(config.cloudSqlIpType)) throw new Error('CLOUD_SQL_IP_TYPE must be PRIVATE, PUBLIC, or PSC');
  if (databaseMode === 'url') {
    if (!config.databaseUrl) throw new Error('DATABASE_URL is required when DATABASE_MODE=url');
  } else {
    if (!config.cloudSqlInstanceConnectionName) throw new Error('CLOUD_SQL_INSTANCE_CONNECTION_NAME is required when DATABASE_MODE=cloudsql-iam');
    if (!config.cloudSqlIamDbUser) throw new Error('CLOUD_SQL_IAM_DB_USER is required when DATABASE_MODE=cloudsql-iam');
  }
  return Object.freeze(config);
}

export function loadConfig() {
  const nodeEnv = optional('NODE_ENV', 'development');
  const appEnv = optional('APP_ENV', nodeEnv === 'production' ? 'production' : 'development');
  if (!['development', 'test', 'staging', 'production'].includes(appEnv)) throw new Error('APP_ENV must be development, test, staging, or production');

  const isProduction = appEnv === 'production';
  const isDeployed = appEnv === 'staging' || isProduction;
  const publicAppOrigins = parseOrigins(optional('PUBLIC_APP_ORIGINS', optional('PUBLIC_APP_ORIGIN', 'http://localhost:3000')));
  const databaseMode = optional('DATABASE_MODE', 'url');
  const storageProvider = optional('STORAGE_PROVIDER', 'gcs').toLowerCase();
  const redisMode = optional('REDIS_MODE', 'tcp').toLowerCase();
  if (!['url', 'cloudsql-iam'].includes(databaseMode)) throw new Error('DATABASE_MODE must be url or cloudsql-iam');
  if (!['gcs', 'r2', 'r2-worker'].includes(storageProvider)) throw new Error('STORAGE_PROVIDER must be gcs, r2, or r2-worker');
  if (!['tcp', 'rest'].includes(redisMode)) throw new Error('REDIS_MODE must be tcp or rest');

  const config = {
    nodeEnv, env: appEnv, appEnv,
    isProd: isProduction, isProduction, isDeployed,
    port: integer('PORT', 8080, { min: 1, max: 65535 }),
    publicAppOrigins,
    publicAppOrigin: publicAppOrigins[0],

    databaseMode,
    databaseUrl: optional('DATABASE_URL'),
    cloudSqlInstanceConnectionName: optional('CLOUD_SQL_INSTANCE_CONNECTION_NAME'),
    cloudSqlIamDbUser: optional('CLOUD_SQL_IAM_DB_USER'),
    cloudSqlIpType: optional('CLOUD_SQL_IP_TYPE', 'PRIVATE').toUpperCase(),
    dbName: optional('DB_NAME', 'thiqah'),
    dbPoolMax: integer('DB_POOL_MAX', 5, { min: 1, max: 50 }),

    redisMode,
    redisUrl: optional('REDIS_URL'),
    redisCaCertBase64: optional('REDIS_CA_CERT_BASE64'),
    upstashRedisRestUrl: optional('UPSTASH_REDIS_REST_URL'),
    upstashRedisRestToken: optional('UPSTASH_REDIS_REST_TOKEN'),

    sessionCookieName: optional('SESSION_COOKIE_NAME', 'thiqah_session'),
    sessionCookieSameSite: optional('SESSION_COOKIE_SAME_SITE', 'lax').toLowerCase(),
    sessionTtlSeconds: integer('SESSION_TTL_SECONDS', 604800, { min: 300, max: 2592000 }),
    sessionHmacKey: required('SESSION_HMAC_KEY'),
    piiHashKey: required('PII_HASH_KEY'),
    mfaEncryptionKeyBase64: required('MFA_ENCRYPTION_KEY_BASE64'),
    tokenEncryptionKeyBase64: required('TOKEN_ENCRYPTION_KEY_BASE64'),

    storageProvider,
    gcsBucket: optional('GCS_BUCKET'),
    gcpProjectId: optional('GCP_PROJECT_ID'),
    r2AccountId: optional('R2_ACCOUNT_ID'),
    r2Bucket: optional('R2_BUCKET'),
    r2AccessKeyId: optional('R2_ACCESS_KEY_ID'),
    r2SecretAccessKey: optional('R2_SECRET_ACCESS_KEY'),
    r2WorkerUrl: optional('R2_WORKER_URL').replace(/\/$/, ''),
    r2WorkerHmacKey: optional('R2_WORKER_HMAC_KEY'),

    otpProvider: optional('OTP_PROVIDER', 'log').toLowerCase(),
    smsSenderId: optional('SMS_SENDER_ID', 'THIQAH'),
    smsWebhookUrl: optional('SMS_WEBHOOK_URL'),
    smsWebhookBearerToken: optional('SMS_WEBHOOK_BEARER_TOKEN'),
    unifonicAppSid: optional('UNIFONIC_APPSID'),
    unifonicBaseUrl: optional('UNIFONIC_BASE_URL', 'https://el.cloud.unifonic.com/rest/SMS/messages'),

    emailProvider: optional('EMAIL_PROVIDER', 'log').toLowerCase(),
    supportFromEmail: optional('SUPPORT_FROM_EMAIL'),
    emailWebhookUrl: optional('EMAIL_WEBHOOK_URL'),
    emailWebhookBearerToken: optional('EMAIL_WEBHOOK_BEARER_TOKEN'),
    resendApiKey: optional('RESEND_API_KEY'),
    resendBaseUrl: optional('RESEND_BASE_URL', 'https://api.resend.com')
  };

  if (!['lax', 'strict', 'none'].includes(config.sessionCookieSameSite)) throw new Error('SESSION_COOKIE_SAME_SITE must be lax, strict, or none');
  if (!['PRIVATE', 'PUBLIC', 'PSC'].includes(config.cloudSqlIpType)) throw new Error('CLOUD_SQL_IP_TYPE must be PRIVATE, PUBLIC, or PSC');
  if (!['log', 'webhook', 'unifonic'].includes(config.otpProvider)) throw new Error('OTP_PROVIDER must be log, webhook, or unifonic');
  if (!['log', 'webhook', 'resend'].includes(config.emailProvider)) throw new Error('EMAIL_PROVIDER must be log, webhook, or resend');

  if (config.databaseMode === 'url') {
    if (!config.databaseUrl) throw new Error('DATABASE_URL is required when DATABASE_MODE=url');
  } else {
    required('CLOUD_SQL_INSTANCE_CONNECTION_NAME');
    required('CLOUD_SQL_IAM_DB_USER');
  }

  if (config.redisMode === 'rest') {
    validateUpstashRestUrl(config.upstashRedisRestUrl);
    if (!config.upstashRedisRestUrl || !config.upstashRedisRestToken) throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required when REDIS_MODE=rest');
  }

  if (config.storageProvider === 'gcs') {
    if (!config.gcsBucket) throw new Error('GCS_BUCKET is required when STORAGE_PROVIDER=gcs');
    if (!config.gcpProjectId) throw new Error('GCP_PROJECT_ID is required when STORAGE_PROVIDER=gcs');
  } else if (config.storageProvider === 'r2') {
    if (!config.r2AccountId || !config.r2Bucket || !config.r2AccessKeyId || !config.r2SecretAccessKey) {
      throw new Error('R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required when STORAGE_PROVIDER=r2');
    }
  } else {
    if (!config.r2WorkerUrl || !config.r2WorkerHmacKey) throw new Error('R2_WORKER_URL and R2_WORKER_HMAC_KEY are required when STORAGE_PROVIDER=r2-worker');
    validateR2WorkerUrl(config.r2WorkerUrl);
    if (config.r2WorkerHmacKey.length < 32) throw new Error('R2_WORKER_HMAC_KEY must be at least 32 characters');
  }

  if (config.sessionHmacKey.length < 32 || config.piiHashKey.length < 32) throw new Error('SESSION_HMAC_KEY and PII_HASH_KEY must each be at least 32 characters');
  const mfaKey = Buffer.from(config.mfaEncryptionKeyBase64, 'base64');
  const tokenKey = Buffer.from(config.tokenEncryptionKeyBase64, 'base64');
  if (mfaKey.length !== 32) throw new Error('MFA_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes');
  if (tokenKey.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes');

  if (isDeployed) {
    if (nodeEnv !== 'production') throw new Error('NODE_ENV must be production for staging/production deployments');
    if (config.redisMode === 'tcp' && !config.redisUrl) throw new Error('REDIS_URL is required for staging/production when REDIS_MODE=tcp');
    if (config.otpProvider === 'log') throw new Error('OTP_PROVIDER=log is forbidden for staging/production');
    if (config.emailProvider === 'log') throw new Error('EMAIL_PROVIDER=log is forbidden for staging/production');
    if (!config.supportFromEmail) throw new Error('SUPPORT_FROM_EMAIL is required for staging/production');
    if (publicAppOrigins.some((origin) => !origin.startsWith('https://'))) throw new Error('Staging/production public origins must use HTTPS');
  }

  if (config.otpProvider === 'webhook' && !config.smsWebhookUrl) throw new Error('SMS_WEBHOOK_URL is required when OTP_PROVIDER=webhook');
  if (config.otpProvider === 'unifonic' && !config.unifonicAppSid) throw new Error('UNIFONIC_APPSID is required when OTP_PROVIDER=unifonic');
  if (config.emailProvider === 'webhook' && !config.emailWebhookUrl) throw new Error('EMAIL_WEBHOOK_URL is required when EMAIL_PROVIDER=webhook');
  if (config.emailProvider === 'resend' && !config.resendApiKey) throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend');

  return Object.freeze(config);
}
