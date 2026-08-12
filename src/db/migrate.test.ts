import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runMigrations } from './migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://deptos:deptos@localhost:55432/deptos_core';

// Regression coverage for the bug QC caught live: a migration runner that reports "Migration
// applied" without actually changing anything on a database that already has an old table
// structure. Each test runs against its own Postgres schema (namespace) so it never touches the
// tables the rest of the suite depends on.

async function schemaPool(schema: string): Promise<Pool> {
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  return pool;
}

describe('runMigrations', () => {
  it('applies all migrations to a fresh database and creates the nullable submission_id + CHECK constraint', async () => {
    const schema = 'migrate_test_fresh';
    const db = await schemaPool(schema);
    try {
      const applied = await runMigrations(db);
      expect(applied).toEqual([
        '001_initial_schema.sql',
        '002_nullable_submission_id.sql',
        '003_source_artifact_resolved_content.sql',
        '004_claims_and_evidence.sql',
      ]);

      const column = await db.query(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'source_artifact' AND column_name = 'submission_id'`,
        [schema],
      );
      expect(column.rows[0].is_nullable).toBe('YES');

      // Behavioral check: the CHECK constraint must actually reject a row that violates it in
      // THIS schema — this can't be fooled by a catalog query matching a same-named constraint
      // on a table in a different schema (the bug QC caught).
      const investigation = await db.query(
        `INSERT INTO investigation (id) VALUES (gen_random_uuid()) RETURNING id`,
      );
      await expect(
        db.query(
          `INSERT INTO source_artifact (id, investigation_id, type, raw, origin, submission_id)
           VALUES (gen_random_uuid(), $1, 'url', 'x', 'submitted', NULL)`,
          [investigation.rows[0].id],
        ),
      ).rejects.toThrow();

      // Secondary/supporting check: constraint exists on THIS schema's source_artifact table
      // specifically, scoped via conrelid resolved through the connection's search_path.
      const constraint = await db.query(
        `SELECT 1 FROM pg_constraint
         WHERE conname = 'source_artifact_submission_id_matches_origin'
           AND conrelid = 'source_artifact'::regclass`,
      );
      expect(constraint.rowCount).toBe(1);

      // Re-running is a no-op: nothing new applied.
      const secondRun = await runMigrations(db);
      expect(secondRun).toEqual([]);
    } finally {
      await db.query(`DROP SCHEMA "${schema}" CASCADE`);
      await db.end();
    }
  });

  it('creates the claim/claim_version/evidence_item/claim_version_evidence immutability triggers even when a same-named trigger already exists on an unrelated table (QC-caught tgrelid-scoping bug in 004)', async () => {
    // Regression for the same defect class QC found and required fixing in
    // 002_nullable_submission_id.sql: the 004 migration's trigger-existence guards originally
    // checked `pg_trigger WHERE tgname = '<name>'` with no tgrelid scoping. Trigger names are
    // unique per-table, not globally, so a same-named trigger on an unrelated table would make
    // the unscoped EXISTS check falsely report "already exists" and silently skip creating the
    // intended trigger on claim/claim_version/evidence_item/claim_version_evidence. This test
    // plants exactly that collision before running the migration.
    const schema = 'migrate_test_trigger_collision';
    const db = await schemaPool(schema);
    try {
      // Plant an unrelated table in the SAME schema, each carrying a trigger whose name collides
      // with one of the 004 immutability trigger names — reusing the same trigger function is
      // fine, since Postgres trigger names only need to be unique per-table, not globally.
      await db.query(`
        CREATE OR REPLACE FUNCTION noop_trigger() RETURNS TRIGGER AS $$
        BEGIN
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      await db.query(`CREATE TABLE unrelated_table (id UUID PRIMARY KEY DEFAULT gen_random_uuid())`);
      for (const collidingName of [
        'claim_immutable',
        'claim_version_immutable',
        'evidence_item_immutable',
        'claim_version_evidence_immutable',
      ]) {
        await db.query(
          `CREATE TRIGGER ${collidingName} BEFORE UPDATE OR DELETE ON unrelated_table
             FOR EACH ROW EXECUTE FUNCTION noop_trigger()`,
        );
      }

      const applied = await runMigrations(db);
      expect(applied).toEqual([
        '001_initial_schema.sql',
        '002_nullable_submission_id.sql',
        '003_source_artifact_resolved_content.sql',
        '004_claims_and_evidence.sql',
      ]);

      // The intended triggers must exist on THEIR OWN tables — scoped via tgrelid resolved
      // through the connection's search_path — despite the same-named triggers on
      // unrelated_table. An unscoped `tgname`-only check would have skipped creating these.
      const checks: [string, string][] = [
        ['claim_immutable', 'claim'],
        ['claim_version_immutable', 'claim_version'],
        ['evidence_item_immutable', 'evidence_item'],
        ['claim_version_evidence_immutable', 'claim_version_evidence'],
      ];
      for (const [triggerName, tableName] of checks) {
        const trigger = await db.query(
          `SELECT 1 FROM pg_trigger WHERE tgname = $1 AND tgrelid = $2::regclass`,
          [triggerName, tableName],
        );
        expect(trigger.rowCount).toBe(1);
      }

      // Behavioral check: the immutability trigger actually fires on the correct table.
      const claim = await db.query(`INSERT INTO claim (id) VALUES (gen_random_uuid()) RETURNING id`);
      await expect(
        db.query(`DELETE FROM claim WHERE id = $1`, [claim.rows[0].id]),
      ).rejects.toThrow(/append-only table/);
    } finally {
      await db.query(`DROP SCHEMA "${schema}" CASCADE`);
      await db.end();
    }
  });

  it('fixes a pre-existing database that only has migration 001 applied (the QC-reproduced bug scenario)', async () => {
    const schema = 'migrate_test_pre_fix';
    const db = await schemaPool(schema);
    try {
      // Simulate a database provisioned before migration 002 existed: apply only 001, by hand,
      // exactly as the old `CREATE TABLE IF NOT EXISTS`-only runner would have left it —
      // submission_id NOT NULL, no matching-origin CHECK constraint.
      const initialSql = readFileSync(path.join(MIGRATIONS_DIR, '001_initial_schema.sql'), 'utf-8');
      await db.query(initialSql);
      await db.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          filename    TEXT PRIMARY KEY,
          applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query(`INSERT INTO schema_migrations (filename) VALUES ('001_initial_schema.sql')`);

      const before = await db.query(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'source_artifact' AND column_name = 'submission_id'`,
        [schema],
      );
      expect(before.rows[0].is_nullable).toBe('NO');

      const applied = await runMigrations(db);
      expect(applied).toEqual([
        '002_nullable_submission_id.sql',
        '003_source_artifact_resolved_content.sql',
        '004_claims_and_evidence.sql',
      ]);

      const after = await db.query(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'source_artifact' AND column_name = 'submission_id'`,
        [schema],
      );
      expect(after.rows[0].is_nullable).toBe('YES');

      const investigation = await db.query(
        `INSERT INTO investigation (id) VALUES (gen_random_uuid()) RETURNING id`,
      );
      await expect(
        db.query(
          `INSERT INTO source_artifact (id, investigation_id, type, raw, origin, submission_id)
           VALUES (gen_random_uuid(), $1, 'url', 'x', 'submitted', NULL)`,
          [investigation.rows[0].id],
        ),
      ).rejects.toThrow();

      const constraint = await db.query(
        `SELECT 1 FROM pg_constraint
         WHERE conname = 'source_artifact_submission_id_matches_origin'
           AND conrelid = 'source_artifact'::regclass`,
      );
      expect(constraint.rowCount).toBe(1);
    } finally {
      await db.query(`DROP SCHEMA "${schema}" CASCADE`);
      await db.end();
    }
  });
});
