import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../apps/api/src/config.js';
import { adminPasswordLogin } from '../apps/api/src/services/auth.js';
import { hashPassword } from '../apps/api/src/lib/crypto.js';
import { createR2StorageService } from '../apps/api/src/services/storage-r2.js';

function withEnv(values, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const base64Key = Buffer.alloc(32, 7).toString('base64');

test('free staging config uses Neon URL, Upstash Redis and R2 without GCP requirements', () => {
  withEnv({
    NODE_ENV: 'production',
    APP_ENV: 'staging',
    PUBLIC_APP_ORIGINS: 'https://staging.example.com',
    DATABASE_MODE: 'url',
    DATABASE_URL: 'postgresql://user:pass@example.neon.tech/neondb?sslmode=require',
    REDIS_URL: 'rediss://default:pass@example.upstash.io:6379',
    SESSION_HMAC_KEY: 's'.repeat(64),
    PII_HASH_KEY: 'p'.repeat(64),
    ADMIN_MFA_REQUIRED: 'false',
    MFA_ENCRYPTION_KEY_BASE64: base64Key,
    TOKEN_ENCRYPTION_KEY_BASE64: base64Key,
    STORAGE_PROVIDER: 'r2',
    R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
    R2_BUCKET: 'thiqah-staging-private',
    R2_ACCESS_KEY_ID: 'test-access-key',
    R2_SECRET_ACCESS_KEY: 'test-secret-key',
    GCP_PROJECT_ID: undefined,
    GCS_BUCKET: undefined,
    OTP_PROVIDER: 'unifonic',
    UNIFONIC_APPSID: 'test-appsid',
    SMS_SENDER_ID: 'THIQAH',
    EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 're_test',
    SUPPORT_FROM_EMAIL: 'support@example.com'
  }, () => {
    const config = loadConfig();
    assert.equal(config.databaseMode, 'url');
    assert.equal(config.storageProvider, 'r2');
    assert.equal(config.gcpProjectId, '');
    assert.equal(config.gcsBucket, '');
    assert.match(config.redisUrl, /^rediss:\/\//);
    assert.equal(config.adminMfaRequired, false);
    process.env.APP_ENV = 'production';
    assert.throws(() => loadConfig(), /ADMIN_MFA_REQUIRED=false is forbidden in production/);
  });
});

test('staging password-only admin login creates a session without an MFA challenge', async () => {
  const testPassword = 'ValidTestPassword123#';
  const passwordHash = await hashPassword(testPassword);
  let sessionCreated = false;
  const db = {
    async query(sql) {
      if (sql.includes('FROM thiqah.admins')) return {rows:[{
        id:'550e8400-e29b-41d4-a716-446655440000',username:'admin',display_name:'صالح',
        email:'owner@example.com',password_hash:passwordHash,role:'owner',status:'active',
        mfa_required:true,totp_secret_ciphertext:'configured'
      }]};
      if (sql.includes('INSERT INTO thiqah.auth_sessions')) {
        sessionCreated = true;
        return {rows:[]};
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const result = await adminPasswordLogin({
    db,
    config:{adminMfaRequired:false,sessionHmacKey:'s'.repeat(64),sessionTtlSeconds:3600},
    input:{username:'admin',password:testPassword,clientType:'web'},
    context:{userAgentHash:'ua',ipPrefixHash:'ip'}
  });
  assert.equal(result.mfaRequired,false);
  assert.equal(result.actor.username,'admin');
  assert.equal(sessionCreated,true);
  assert.ok(result.session.token);
});

test('R2 upload intent is private, content-type bound, non-overwriting and short lived', async () => {
  const actorId = '550e8400-e29b-41d4-a716-446655440000';
  const service = createR2StorageService({
    r2AccountId: '0123456789abcdef0123456789abcdef',
    r2Bucket: 'thiqah-staging-private',
    r2AccessKeyId: 'test-access-key',
    r2SecretAccessKey: 'test-secret-key'
  });
  const db = {
    async query(sql) {
      if (sql.includes('SELECT customer_id,status')) return { rows: [{ customer_id: actorId, status: 'new' }] };
      if (sql.includes('INSERT INTO thiqah.media_upload_intents')) {
        return { rows: [{ id: '7cc9d33f-4079-4a4c-a539-95956be9fca6' }] };
      }
      throw new Error(`Unexpected query in R2 test: ${sql}`);
    }
  };

  const createdAt = Date.now();
  const result = await service.createUploadIntent({
    db,
    actor: { actor_type: 'customer', actor_id: actorId },
    orderId: '744f54b8-5565-4450-8474-4a09e54c94ca',
    kind: 'customer_problem',
    mimeType: 'image/png',
    sizeBytes: 1024
  });

  assert.match(result.uploadUrl, /^https:\/\//);
  assert.match(result.uploadUrl, /X-Amz-/i);
  assert.equal(result.requiredHeaders['content-type'], 'image/png');
  assert.equal(result.requiredHeaders['if-none-match'], '*');
  assert.equal(result.maxSizeBytes, 8 * 1024 * 1024);
  assert.ok(result.expiresAt.getTime() - createdAt <= 10 * 60 * 1000 + 2000);
});
