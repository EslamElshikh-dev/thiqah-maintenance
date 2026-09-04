import { hydrateRegionalSecrets } from '../lib/regional-secrets.js';
import { generateSecret } from 'otplib';
import { loadDatabaseConfig } from '../config.js';
import { createDb } from '../plugins/db.js';
import { hashPassword, encryptSecret } from '../lib/crypto.js';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const deployed = process.env.APP_ENV === 'staging' || process.env.APP_ENV === 'production';
const gcpRegionalSecrets = process.env.SECRET_SOURCE === 'gcp-regional' || (
  Boolean(process.env.REGIONAL_SECRET_LOCATION) && Boolean(process.env.REGIONAL_SECRET_PREFIX)
);
if (deployed && gcpRegionalSecrets) {
  await hydrateRegionalSecrets('bootstrap');
}

const dbConfig = loadDatabaseConfig();
const db = await createDb({ ...dbConfig, dbPoolMax: 1 });
const existing = await db.query(`SELECT id,username FROM thiqah.admins WHERE role='owner' LIMIT 1`);
if (existing.rows[0]) {
  await db.close();
  throw new Error(`Owner already exists: ${existing.rows[0].username}. Runtime admin bootstrap is intentionally forbidden.`);
}

const username = required('ADMIN_BOOTSTRAP_USERNAME').trim().toLowerCase();
const email = required('ADMIN_BOOTSTRAP_EMAIL').trim().toLowerCase();
const displayName = required('ADMIN_BOOTSTRAP_DISPLAY_NAME').trim();
const passwordHash = await hashPassword(required('ADMIN_BOOTSTRAP_PASSWORD'));
const suppliedTotp = process.env.ADMIN_BOOTSTRAP_TOTP_SECRET;
if (dbConfig.isDeployed && !suppliedTotp) {
  await db.close();
  throw new Error('ADMIN_BOOTSTRAP_TOTP_SECRET is required in staging/production and must be provisioned out-of-band');
}
const secret = suppliedTotp || generateSecret();
const encrypted = encryptSecret(secret, required('MFA_ENCRYPTION_KEY_BASE64'));

try {
  await db.tx(async (client) => {
    const admin = (await client.query(
      `INSERT INTO thiqah.admins(username,display_name,email,email_verified_at,password_hash,role,mfa_required)
       VALUES($1,$2,$3,now(),$4,'owner',true) RETURNING id`,
      [username, displayName, email, passwordHash]
    )).rows[0];
    await client.query(
      `INSERT INTO thiqah.admin_mfa(admin_id,totp_secret_ciphertext) VALUES($1,$2)`,
      [admin.id, encrypted]
    );
  });
  console.log('Owner created once. Delete bootstrap password and TOTP values immediately.');
  if (!dbConfig.isDeployed && !suppliedTotp) console.log(`DEV_TOTP_SECRET=${secret}`);
} finally {
  await db.close();
}
