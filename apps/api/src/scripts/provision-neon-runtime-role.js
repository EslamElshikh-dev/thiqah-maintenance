import pg from 'pg';

const { Client } = pg;
const RUNTIME_ROLE = 'thiqah_runtime';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function validateAdminUrl(value) {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('NEON_DATABASE_URL_ADMIN must be a PostgreSQL URL');
  if (!url.hostname.endsWith('.neon.tech')) throw new Error('NEON_DATABASE_URL_ADMIN must target a Neon hostname');
  return url;
}

function validateRuntimePassword(value) {
  const password = String(value || '');
  if (!/^[A-Fa-f0-9]{64}$/.test(password)) throw new Error('NEON_RUNTIME_DB_PASSWORD must be a 64-character random hex value');
  return password;
}

function runtimeUrlFromAdmin(adminUrl, password) {
  const url = new URL(adminUrl.toString());
  url.username = RUNTIME_ROLE;
  url.password = password;
  return url;
}

const adminUrl = validateAdminUrl(required('NEON_DATABASE_URL_ADMIN'));
const runtimePassword = validateRuntimePassword(required('NEON_RUNTIME_DB_PASSWORD'));
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
  await client.query(`ALTER ROLE ${RUNTIME_ROLE} INHERIT PASSWORD '${runtimePassword}'`);
  await client.query(`GRANT thiqah_app TO ${RUNTIME_ROLE}`);
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}

const runtime = new Client({ connectionString: runtimeUrlFromAdmin(adminUrl, runtimePassword).toString(), application_name: 'thiqah-neon-runtime-verifier' });
await runtime.connect();
try {
  const role = (await runtime.query(`SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolinherit FROM pg_roles WHERE rolname = current_user`)).rows[0];
  if (!role || role.rolname !== RUNTIME_ROLE) throw new Error('Runtime role identity verification failed');
  if (role.rolsuper || role.rolcreatedb || role.rolcreaterole || !role.rolinherit) throw new Error('Runtime role has unsafe PostgreSQL role attributes');
  const privileges = (await runtime.query(`
    SELECT
      has_schema_privilege(current_user, 'thiqah', 'USAGE') AS schema_usage,
      has_schema_privilege(current_user, 'thiqah', 'CREATE') AS schema_create,
      has_table_privilege(current_user, 'thiqah.services', 'SELECT') AS services_select,
      has_table_privilege(current_user, 'thiqah.orders', 'INSERT,UPDATE,SELECT') AS orders_rw
  `)).rows[0];
  if (!privileges.schema_usage || privileges.schema_create || !privileges.services_select || !privileges.orders_rw) throw new Error('Runtime role privilege verification failed');
  console.log('Neon runtime role verified: least-privilege boundary passed.');
  console.log(`RUNTIME_DATABASE_HOST=${adminUrl.hostname}`);
  console.log(`RUNTIME_DATABASE_USER=${RUNTIME_ROLE}`);
} finally {
  await runtime.end();
}
