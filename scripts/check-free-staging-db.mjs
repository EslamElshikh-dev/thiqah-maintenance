import { loadDatabaseConfig } from '../apps/api/src/config.js';
import { createDb } from '../apps/api/src/plugins/db.js';

const config = loadDatabaseConfig();
if (config.databaseMode !== 'url') throw new Error('Free staging database check requires DATABASE_MODE=url');

const db = await createDb({ ...config, dbPoolMax: 1 });
try {
  const schema = await db.query(`SELECT to_regnamespace('thiqah') IS NOT NULL AS ok`);
  const orders = await db.query(`SELECT to_regclass('thiqah.orders') IS NOT NULL AS ok`);
  const migrations = await db.query(`SELECT count(*)::int AS count FROM public.thiqah_schema_migrations`);
  if (!schema.rows[0]?.ok || !orders.rows[0]?.ok) throw new Error('Thiqah schema is incomplete');
  if (Number(migrations.rows[0]?.count || 0) < 6) throw new Error('Expected at least six verified migrations');
  console.log(`free staging database ready; migrations=${migrations.rows[0].count}`);
} finally {
  await db.close();
}
