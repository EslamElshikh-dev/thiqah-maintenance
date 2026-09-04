import pg from 'pg';
import { createPostgresScramVerifier, isPostgresScramVerifier } from '../lib/scram.js';

const { Client } = pg;
const RUNTIME_ROLE = 'thiqah_runtime';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function validateAdminUrl(value) {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('NEON_DATABASE_URL_ADMIN must be a PostgreSQL URL');
  }
  if (!url.hostname.endsWith('.neon.tech')) {
    throw new Error('NEON_DATABASE_URL_ADMIN must target a Neon hostname');
  }
  return url;
}

const adminUrl = validateAdminUrl(required('NEON_DATABASE_URL_ADMIN'));
const runtimePassword = required('NEON_RUNTIME_DB_PASSWORD');
const verifier = createPostgresScramVerifier(runtimePassword);
if (!isPostgresScramVerifier(verifier)) throw new Error('Generated invalid SCRAM verifier');

const client = new Client({ connectionString: adminUrl.toString(), application_name: 'thiqah-neon-role-provisioner' });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE}') THEN
        CREATE ROLE ${RUNTIME_ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT;
      END IF;
    END
    $$;
  `);
  await client.query(`ALTER ROLE ${RUNTIME_ROLE} INHERIT PASSWORD '${verifier}'`);
  await client.query(`GRANT thiqah_app TO ${RUNTIME_ROLE}`);
  await client.query('COMMIT');

  console.log('Neon runtime role provisioned with inherited thiqah_app privileges.');
  console.log(`RUNTIME_DATABASE_HOST=${adminUrl.hostname}`);
  console.log(`RUNTIME_DATABASE_USER=${RUNTIME_ROLE}`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
