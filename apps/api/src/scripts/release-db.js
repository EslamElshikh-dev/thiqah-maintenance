import { loadDatabaseConfig } from '../config.js';
import { createDb } from '../plugins/db.js';
import { runMigrations } from '../lib/migrations.js';
import { grantRuntimeRole } from '../lib/db-roles.js';

const db = await createDb({ ...loadDatabaseConfig(), dbPoolMax: 1 });
try {
  await runMigrations(db);
  await grantRuntimeRole(db, process.env.RUNTIME_IAM_DB_USER);
  console.log('Database release completed.');
} finally {
  await db.close();
}
