import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function transactionalSql(sql) {
  // Phase 1 migration files are immutable and include their own outer BEGIN/COMMIT.
  // The migration runner owns the transaction so it strips only those standalone
  // wrapper statements at execution time while checksumming the original bytes.
  return sql
    .replace(/^\s*BEGIN;\s*$/m, '')
    .replace(/^\s*COMMIT;\s*$/m, '');
}

export async function runMigrations(db, { migrationDir = resolve('packages/db/migrations'), log = console.log } = {}) {
  const client = await db.pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.thiqah_schema_migrations(
        filename text PRIMARY KEY,
        sha256 text,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`ALTER TABLE public.thiqah_schema_migrations ADD COLUMN IF NOT EXISTS sha256 text`);
    await client.query(`SELECT pg_advisory_lock(742_184_931)`);

    const files = readdirSync(migrationDir).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = readFileSync(resolve(migrationDir, file), 'utf8');
      const checksum = sha256(sql);
      const applied = await client.query(
        `SELECT sha256 FROM public.thiqah_schema_migrations WHERE filename=$1`,
        [file]
      );
      if (applied.rows[0]) {
        if (!applied.rows[0].sha256 || applied.rows[0].sha256 !== checksum) {
          throw new Error(`Applied migration checksum mismatch: ${file}`);
        }
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(transactionalSql(sql));
        await client.query(
          `INSERT INTO public.thiqah_schema_migrations(filename,sha256) VALUES($1,$2)`,
          [file, checksum]
        );
        await client.query('COMMIT');
        log(`applied ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    try { await client.query(`SELECT pg_advisory_unlock(742_184_931)`); } catch {}
    client.release();
  }
}
