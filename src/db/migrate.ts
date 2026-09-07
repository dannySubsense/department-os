import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Pool } from 'pg';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Numbered-migration runner: each file in `migrations/` is applied at most once, tracked in the
 * `schema_migrations` table. This is deliberate — a single `CREATE TABLE IF NOT EXISTS` schema
 * file previously reported "Migration applied" even when it changed nothing on a database that
 * already had the old table structure (constraint changes were silently skipped). Every migration
 * here runs inside its own transaction and is recorded only after it actually executes, so a
 * pre-existing database picks up later migrations instead of being silently left on the old shape.
 */
export async function runMigrations(db: Pool = pool): Promise<string[]> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await db.query<{ filename: string }>('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.filename));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const newlyApplied: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      newlyApplied.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration failed: ${file}: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }

  return newlyApplied;
}

async function main() {
  const applied = await runMigrations();
  if (applied.length === 0) {
    console.log('No migrations to apply — database already up to date.');
  } else {
    for (const file of applied) {
      console.log(`Migration applied: ${file}`);
    }
  }
  await pool.end();
}

// Only run when executed directly (not when imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Migration failed:', err.message ?? err);
    process.exit(1);
  });
}
