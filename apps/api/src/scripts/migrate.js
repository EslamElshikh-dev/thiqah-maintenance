import { loadDatabaseConfig } from '../config.js';
import { createDb } from '../plugins/db.js';
import { runMigrations } from '../lib/migrations.js';

const db = await createDb({ ...loadDatabaseConfig(), dbPoolMax: 1 });
try {
  await runMigrations(db);
} finally {
  await db.close();
}
