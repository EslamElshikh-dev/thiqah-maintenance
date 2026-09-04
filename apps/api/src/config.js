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


export function loadDatabaseConfig() {
  const nodeEnv = optional('NODE_ENV', 'development');
  const appEnv = optional('APP_ENV', nodeEnv === 'production' ? 'production' : 'development');
  if (!['development', 'test', 'staging', 'production'].includes(appEnv)) {
    throw new Error('APP_ENV must be development, test, staging, or production');
  }
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
  if (!['PRIVATE', 'PUBLIC', 'PSC'].includes(config.cloudSqlIpType)) {
    throw new Error('CLOUD_SQL_IP_TYPE must be PRIVATE, PUBLIC, or PSC');
  }
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
  if (!['development', 'test', 'staging', 'production'].includes(appEnv)) {
    throw new Error('APP_ENV must be development, test, staging, or production');
  }

  const isProduction = appEnv === 'production';
  const isDeployed = appEnv === 'staging' || isProduction;
  const publicAppOrigins = parseOrigins(optional('PUBLIC_APP_ORIGINS', optional('PUBLIC_APP_ORIGIN', 'http://localhost:3000')));
  const databaseMode = optional('DATABASE_MODE', 'url');
  if (!['url', 'cloudsql-iam'].includes(databaseMode)) throw new Error('DATABASE_MODE must be url or cloudsql-iam');

  const config = {
    nodeEnv,
    env: appEnv,
    appEnv,
    isProd: isProduction,
    isProduction,
    isDeployed,
    port: integer('PORT', 8080, { min: 1, max: 65535 }),
    publicAppOrigins,
    publicAppOrigin: publicAppOrigins[0],

    databaseMode,
    databaseUrl: optional('DATABASE_URL'),
    cloudSqlInstanceConnectionName: optional('CLOUD_SQL_INSTANCE_CONNECTION_NAME'),
    cloudSqlIamDbUser: optional('CLOUD_SQL_IAM_DB_USER'),
    cloudSqlIpType: optional('CLOUD_SQL_IP_TYPE', 'PRIVATE').toUpperCase(),
    dbName: optional('DB_NAME', 'thiqah'),
    dbPoolMax: integer('DB_POOL_MAX', isDeployed ? 5 : 5, { min: 1, max: 50 }),

    redisUrl: optional('REDIS_URL'),
    redisCaCertBase64: optional('REDIS_CA_CERT_BASE64'),

    sessionCookieName: optional('SESSION_COOKIE_NAME', 'thiqah_session'),
    sessionCookieSameSite: optional('SESSION_COOKIE_SAME_SITE', 'lax').toLowerCase(),
    sessionTtlSeconds: integer('SESSION_TTL_SECONDS', 604800, { min: 300, max: 2592000 }),
    sessionHmacKey: required('SESSION_HMAC_KEY'),
    piiHashKey: required('PII_HASH_KEY'),
    mfaEncryptionKeyBase64: required('MFA_ENCRYPTION_KEY_BASE64'),
    tokenEncryptionKeyBase64: required('TOKEN_ENCRYPTION_KEY_BASE64'),

    gcsBucket: required('GCS_BUCKET'),
    gcpProjectId: required('GCP_PROJECT_ID'),

    otpProvider: optional('OTP_PROVIDER', 'log'),
    smsSenderId: optional('SMS_SENDER_ID', 'THIQAH'),
    smsWebhookUrl: optional('SMS_WEBHOOK_URL'),
    smsWebhookBearerToken: optional('SMS_WEBHOOK_BEARER_TOKEN'),

    emailProvider: optional('EMAIL_PROVIDER', 'log'),
    supportFromEmail: optional('SUPPORT_FROM_EMAIL'),
    emailWebhookUrl: optional('EMAIL_WEBHOOK_URL'),
    emailWebhookBearerToken: optional('EMAIL_WEBHOOK_BEARER_TOKEN')
  };

  if (!['lax', 'strict', 'none'].includes(config.sessionCookieSameSite)) {
    throw new Error('SESSION_COOKIE_SAME_SITE must be lax, strict, or none');
  }
  if (!['PRIVATE', 'PUBLIC', 'PSC'].includes(config.cloudSqlIpType)) {
    throw new Error('CLOUD_SQL_IP_TYPE must be PRIVATE, PUBLIC, or PSC');
  }
  if (config.databaseMode === 'url') {
    if (!config.databaseUrl) throw new Error('DATABASE_URL is required when DATABASE_MODE=url');
  } else {
    required('CLOUD_SQL_INSTANCE_CONNECTION_NAME');
    required('CLOUD_SQL_IAM_DB_USER');
  }

  if (config.sessionHmacKey.length < 32 || config.piiHashKey.length < 32) {
    throw new Error('SESSION_HMAC_KEY and PII_HASH_KEY must each be at least 32 characters');
  }
  const mfaKey = Buffer.from(config.mfaEncryptionKeyBase64, 'base64');
  const tokenKey = Buffer.from(config.tokenEncryptionKeyBase64, 'base64');
  if (mfaKey.length !== 32) throw new Error('MFA_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes');
  if (tokenKey.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes');

  if (isDeployed) {
    if (nodeEnv !== 'production') throw new Error('NODE_ENV must be production for staging/production deployments');
    if (!config.redisUrl) throw new Error('REDIS_URL is required for staging/production');
    if (config.otpProvider === 'log') throw new Error('OTP_PROVIDER=log is forbidden for staging/production');
    if (config.emailProvider === 'log') throw new Error('EMAIL_PROVIDER=log is forbidden for staging/production');
    if (!config.supportFromEmail) throw new Error('SUPPORT_FROM_EMAIL is required for staging/production');
    if (publicAppOrigins.some((origin) => !origin.startsWith('https://'))) {
      throw new Error('Staging/production public origins must use HTTPS');
    }
    if (config.sessionCookieSameSite === 'none' && !isDeployed) {
      throw new Error('SameSite=None requires a secure deployed environment');
    }
  }

  if (config.otpProvider === 'webhook' && !config.smsWebhookUrl) {
    throw new Error('SMS_WEBHOOK_URL is required when OTP_PROVIDER=webhook');
  }
  if (config.emailProvider === 'webhook' && !config.emailWebhookUrl) {
    throw new Error('EMAIL_WEBHOOK_URL is required when EMAIL_PROVIDER=webhook');
  }

  return Object.freeze(config);
}
