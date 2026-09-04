import { hydrateRegionalSecrets } from './lib/regional-secrets.js';
import { loadConfig } from './config.js';
import { createDb } from './plugins/db.js';
import { createRedis } from './plugins/redis.js';
import { createStorageService } from './services/storage.js';
import { createR2StorageService } from './services/storage-r2.js';
import { createR2WorkerStorageService } from './services/storage-r2-worker.js';
import { createSmsProvider } from './services/sms.js';
import { createEmailProvider } from './services/email.js';
import { createUnavailableService } from './services/unavailable.js';
import { buildApp } from './app.js';

const deployed = process.env.APP_ENV === 'staging' || process.env.APP_ENV === 'production';
const gcpRegionalSecrets = process.env.SECRET_SOURCE === 'gcp-regional' || (
  Boolean(process.env.REGIONAL_SECRET_LOCATION) && Boolean(process.env.REGIONAL_SECRET_PREFIX)
);
if (deployed && gcpRegionalSecrets) {
  await hydrateRegionalSecrets('runtime');
}

const config = loadConfig();
const coreStagingMode = process.env.CORE_STAGING_MODE === 'true';
if (coreStagingMode && config.appEnv !== 'staging') {
  throw new Error('CORE_STAGING_MODE is allowed only when APP_ENV=staging');
}

const SENTINEL = 'not-configured';
const configured = (value) => Boolean(value && value !== SENTINEL);
const storageConfigured = config.storageProvider === 'gcs'
  ? configured(config.gcsBucket) && configured(config.gcpProjectId)
  : config.storageProvider === 'r2-worker'
    ? configured(config.r2WorkerUrl) && configured(config.r2WorkerHmacKey)
    : configured(config.r2AccountId) && configured(config.r2Bucket) && configured(config.r2AccessKeyId) && configured(config.r2SecretAccessKey);
const smsConfigured = config.otpProvider === 'webhook'
  ? configured(config.smsWebhookUrl)
  : config.otpProvider === 'unifonic'
    ? configured(config.unifonicAppSid)
    : false;
const emailConfigured = config.emailProvider === 'webhook'
  ? configured(config.emailWebhookUrl)
  : config.emailProvider === 'resend'
    ? configured(config.resendApiKey)
    : false;

if (deployed && !coreStagingMode && (!storageConfigured || !smsConfigured || !emailConfigured)) {
  throw new Error('All external dependencies must be configured outside CORE_STAGING_MODE');
}

const db = await createDb(config);
const redis = createRedis(config);
if (redis && redis.status === 'wait') await redis.connect();

function createConfiguredStorage() {
  if (config.storageProvider === 'r2-worker') return createR2WorkerStorageService(config);
  if (config.storageProvider === 'r2') return createR2StorageService(config);
  return createStorageService(config);
}

const storage = coreStagingMode && !storageConfigured ? createUnavailableService('storage') : createConfiguredStorage();
const sms = coreStagingMode && !smsConfigured ? createUnavailableService('sms') : createSmsProvider(config);
const email = coreStagingMode && !emailConfigured ? createUnavailableService('email') : createEmailProvider(config);
const app = await buildApp({ config, db, redis, storage, sms, email, coreStagingMode });

let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down');
  const hardStop = setTimeout(() => process.exit(1), 25_000);
  hardStop.unref();
  try {
    await app.close();
    if (redis) redis.disconnect();
    await db.close();
    process.exit(0);
  } catch (error) {
    app.log.error({ name: error?.name, code: error?.code }, 'shutdown failed');
    process.exit(1);
  }
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

await app.listen({ host: '0.0.0.0', port: config.port });
