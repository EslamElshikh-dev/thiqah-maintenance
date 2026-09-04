import { loadDatabaseConfig } from '../config.js';
import { createDb } from '../plugins/db.js';
import { grantRuntimeRole } from '../lib/db-roles.js';

const db = await createDb({ ...loadDatabaseConfig(), dbPoolMax: 1 });
try {
  await grantRuntimeRole(db, process.env.RUNTIME_IAM_DB_USER);
  console.log('Granted thiqah_app database role to runtime IAM user.');
} finally {
  await db.close();
}
