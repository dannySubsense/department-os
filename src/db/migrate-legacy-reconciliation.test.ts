import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runMigrations } from './migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const QUARANTINED_007_FIXTURE = path.join(__dirname, 'fixtures', 'quarantined-007-problem-brief-and-versioning.sql');

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://deptos:deptos@localhost:55432/deptos_core';

/**
 * Legacy-path reconciliation coverage (Composer-directed, 2026-08-16 — the exact gap that cost
 * Slice 9 a day: 008's whole purpose is reconciling a database that already carries the
 * QUARANTINED 007, but the committed suite only ever exercised 008 on the fresh 001->008 path,
 * where it is a no-op. Convergence had only been proven by throwaway manual replays. This file
 * exercises the LEGACY path for real, through the production `runMigrations` code path, and
 * asserts the resulting schema mechanically converges with a fresh install — a names-only
 * comparison is precisely the class of check that failed to catch the original drift, so this
 * compares full `pg_constraint` rows and full `information_schema.columns` rows, not a subset. */

async function schemaPool(schema: string): Promise<Pool> {
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  return pool;
}

interface ConstraintRow {
  table_name: string;
  conname: string;
  contype: string;
  condeferrable: boolean;
  condeferred: boolean;
  convalidated: boolean;
  def: string;
}

interface ColumnRow {
  table_name: string;
  column_name: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
}

async function snapshotConstraints(db: Pool, schema: string): Promise<ConstraintRow[]> {
  const result = await db.query<ConstraintRow>(
    `SELECT t.relname AS table_name, c.conname, c.contype, c.condeferrable, c.condeferred,
            c.convalidated, pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = $1
     ORDER BY t.relname, c.conname`,
    [schema],
  );
  return result.rows;
}

async function snapshotColumns(db: Pool, schema: string): Promise<ColumnRow[]> {
  const result = await db.query<ColumnRow>(
    `SELECT table_name, column_name, udt_name, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = $1
     ORDER BY table_name, column_name`,
    [schema],
  );
  return result.rows;
}

describe('008 legacy-path reconciliation (real quarantined-007 fixture required)', () => {
  const fixtureAvailable = existsSync(QUARANTINED_007_FIXTURE);

  it.runIf(fixtureAvailable)(
    'reconciles a database carrying the QUARANTINED 007 (applied, then recorded under its real filename) to schema-identical parity with a fresh 001->008 install — full pg_constraint + information_schema.columns comparison',
    async () => {
      const freshSchema = 'migrate_test_legacy_recon_fresh';
      const legacySchema = 'migrate_test_legacy_recon_legacy';
      const freshDb = await schemaPool(freshSchema);
      const legacyDb = await schemaPool(legacySchema);
      try {
        // ---- Fresh reference: 001 -> 008 in order, through the real runner. ----
        const freshApplied = await runMigrations(freshDb);
        expect(freshApplied).toEqual([
          '001_initial_schema.sql',
          '002_nullable_submission_id.sql',
          '003_source_artifact_resolved_content.sql',
          '004_claims_and_evidence.sql',
          '005_web_search_query_results.sql',
          '006_generation_run_provenance.sql',
          '007_problem_brief_and_versioning.sql',
          '008_reconcile_brief_versioning_constraints.sql',
        ]);

        // ---- Legacy path: 001 -> 006 for real, then the QUARANTINED 007's actual content (NOT
        // the corrected file on disk), then simulate the real-world state that caused this whole
        // remediation: a schema_migrations row recorded for 007's filename, which makes the
        // runner skip the corrected 007 forever (008's own header note, and migrate.ts tracks
        // applied migrations by FILENAME ONLY). ----
        for (const filename of [
          '001_initial_schema.sql',
          '002_nullable_submission_id.sql',
          '003_source_artifact_resolved_content.sql',
          '004_claims_and_evidence.sql',
          '005_web_search_query_results.sql',
          '006_generation_run_provenance.sql',
        ]) {
          const sql = readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf-8');
          await legacyDb.query(sql);
        }
        const quarantined007Sql = readFileSync(QUARANTINED_007_FIXTURE, 'utf-8');
        await legacyDb.query(quarantined007Sql);

        await legacyDb.query(`
          CREATE TABLE IF NOT EXISTS schema_migrations (
            filename    TEXT PRIMARY KEY,
            applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
          )
        `);
        for (const filename of [
          '001_initial_schema.sql',
          '002_nullable_submission_id.sql',
          '003_source_artifact_resolved_content.sql',
          '004_claims_and_evidence.sql',
          '005_web_search_query_results.sql',
          '006_generation_run_provenance.sql',
          '007_problem_brief_and_versioning.sql', // recorded under the QUARANTINED content, per
                                                    // the real-world scenario this migration fixes
        ]) {
          await legacyDb.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [filename]);
        }

        // ---- Run the PRODUCTION migration runner. It must see 007 as already-applied (skip it)
        // and apply only 008 — through the real code path, not hand-applied SQL. ----
        const legacyApplied = await runMigrations(legacyDb);
        expect(legacyApplied).toEqual(['008_reconcile_brief_versioning_constraints.sql']);

        // ---- Mechanical, complete convergence check: every constraint row and every column row,
        // not a subset of names. A names-only comparison is exactly the class of check that
        // missed the original drift (right name, wrong definition/deferrability/type). ----
        const freshConstraints = await snapshotConstraints(freshDb, freshSchema);
        const legacyConstraints = await snapshotConstraints(legacyDb, legacySchema);
        expect(legacyConstraints).toEqual(freshConstraints);

        const freshColumns = await snapshotColumns(freshDb, freshSchema);
        const legacyColumns = await snapshotColumns(legacyDb, legacySchema);
        expect(legacyColumns).toEqual(freshColumns);

        // ---- Idempotency of 008's own SQL content (not merely the runner's filename-tracking
        // skip): re-executing the file's raw contents a second time directly must not throw and
        // must leave the schema unchanged — every guard in 008 is IF-NOT-EXISTS-style, and this
        // proves that in practice, not just by reading the guards. ----
        const reconcileSql = readFileSync(
          path.join(MIGRATIONS_DIR, '008_reconcile_brief_versioning_constraints.sql'),
          'utf-8',
        );
        await expect(legacyDb.query(reconcileSql)).resolves.toBeDefined();

        const legacyConstraintsAfterReplay = await snapshotConstraints(legacyDb, legacySchema);
        expect(legacyConstraintsAfterReplay).toEqual(freshConstraints);
        const legacyColumnsAfterReplay = await snapshotColumns(legacyDb, legacySchema);
        expect(legacyColumnsAfterReplay).toEqual(freshColumns);

        // Re-running through the runner itself is also a no-op (both migrations now recorded).
        const legacyRerunApplied = await runMigrations(legacyDb);
        expect(legacyRerunApplied).toEqual([]);
      } finally {
        await freshDb.query(`DROP SCHEMA "${freshSchema}" CASCADE`);
        await freshDb.end();
        await legacyDb.query(`DROP SCHEMA "${legacySchema}" CASCADE`);
        await legacyDb.end();
      }
    },
  );

  it.runIf(!fixtureAvailable)(
    'BLOCKED — real quarantined-007 fixture not present; the reconciliation test above will run once it exists',
    () => {
      // This is deliberately a real, throwing assertion, not a skip: it fails loudly so the suite
      // cannot go green while this coverage gap is silently unfilled. It fails ONLY when the
      // fixture is absent, and stops being collected (via it.runIf above) the moment the real
      // fixture lands at QUARANTINED_007_FIXTURE, at which point the actual reconciliation test
      // takes over.
      throw new Error(
        `Missing fixture: ${QUARANTINED_007_FIXTURE}. This must be the byte-for-byte content of ` +
          `'git show quarantine/slice-9-attempt-1:src/db/migrations/007_problem_brief_and_versioning.sql' ` +
          `— not an approximation. See Ledger's report for the exact retrieval command.`,
      );
    },
  );
});
