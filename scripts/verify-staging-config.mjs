import { readFileSync } from 'node:fs';

const required = [
  'GCP_PROJECT_ID',
  'GCP_REGION',
  'GCP_ARTIFACT_REPOSITORY',
  'GCP_RUNTIME_SERVICE_ACCOUNT',
  'GCP_MIGRATOR_SERVICE_ACCOUNT',
  'GCP_WORKLOAD_IDENTITY_PROVIDER',
  'GCP_DEPLOY_SERVICE_ACCOUNT',
  'GCP_NETWORK',
  'GCP_SUBNETWORK',
  'CLOUD_SQL_INSTANCE_CONNECTION_NAME',
  'RUNTIME_IAM_DB_USER',
  'MIGRATOR_IAM_DB_USER',
  'GCS_BUCKET',
  'STAGING_PUBLIC_APP_ORIGINS',
  'SMS_WEBHOOK_URL',
  'EMAIL_WEBHOOK_URL',
  'SUPPORT_FROM_EMAIL'
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing staging CI variables: ${missing.join(', ')}`);
  process.exit(1);
}

if (process.env.GCP_REGION !== 'me-central2') {
  console.error('GCP_REGION must be me-central2 for the Saudi staging data plane');
  process.exit(1);
}

const origins = String(process.env.STAGING_PUBLIC_APP_ORIGINS)
  .split(',')
  .map((value) => value.trim().replace(/\/$/, ''))
  .filter(Boolean);
if (!origins.length || origins.some((value) => !value.startsWith('https://'))) {
  console.error('STAGING_PUBLIC_APP_ORIGINS must contain HTTPS origin(s)');
  process.exit(1);
}

for (const name of ['SMS_WEBHOOK_URL', 'EMAIL_WEBHOOK_URL']) {
  let url;
  try { url = new URL(process.env[name]); } catch { url = null; }
  if (!url || url.protocol !== 'https:') {
    console.error(`${name} must be an HTTPS URL`);
    process.exit(1);
  }
}

for (const name of ['GCP_RUNTIME_SERVICE_ACCOUNT', 'GCP_MIGRATOR_SERVICE_ACCOUNT', 'GCP_DEPLOY_SERVICE_ACCOUNT']) {
  if (!/^[a-z0-9][a-z0-9-]{4,28}[a-z0-9]@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(process.env[name])) {
    console.error(`${name} must be a Google Cloud service-account email`);
    process.exit(1);
  }
}

if (!process.env.GCP_WORKLOAD_IDENTITY_PROVIDER.startsWith('projects/')) {
  console.error('GCP_WORKLOAD_IDENTITY_PROVIDER must be the full provider resource name');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (pkg.engines?.node !== '24.x') {
  console.error('Node engine must remain pinned to 24.x');
  process.exit(1);
}
if (pkg.dependencies?.['@google-cloud/secret-manager'] !== '7.0.0') {
  console.error('Regional Secret Manager client must remain explicitly pinned');
  process.exit(1);
}

console.log('staging configuration gate passed');
