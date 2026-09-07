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
        '005_web_search_query_results.sql',
        '006_generation_run_provenance.sql',
        '007_problem_brief_and_versioning.sql',
        '008_reconcile_brief_versioning_constraints.sql',
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
        '005_web_search_query_results.sql',
        '006_generation_run_provenance.sql',
        '007_problem_brief_and_versioning.sql',
        '008_reconcile_brief_versioning_constraints.sql',
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
        '005_web_search_query_results.sql',
        '006_generation_run_provenance.sql',
        '007_problem_brief_and_versioning.sql',
        '008_reconcile_brief_versioning_constraints.sql',
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

  it('006 applies without failing against a pre-existing orphaned web_search_query row (QC BLOCKER-1: NOT VALID backfill-safety), and still rejects new violations', async () => {
    // Reproduces the exact failure QC live-probed: web_search_query.generation_run_id shipped in
    // 005 as a bare NOT NULL UUID with no FK (see 005's header note — generation_run didn't exist
    // yet). Any row inserted under that regime — including this test's planted row — may reference
    // a generation_run_id with no corresponding generation_run row. A plain (validating)
    // `ADD CONSTRAINT ... FOREIGN KEY` in 006 would fail to apply against exactly this state; the
    // fix (NOT VALID) must let 006 apply cleanly here instead.
    const schema = 'migrate_test_006_orphan_backfill';
    const db = await schemaPool(schema);
    try {
      // Apply 001-005 by hand (mirrors the "pre-existing database" pattern above), stopping short
      // of 006 so the FK does not exist yet when the orphaned row is planted.
      for (const filename of [
        '001_initial_schema.sql',
        '002_nullable_submission_id.sql',
        '003_source_artifact_resolved_content.sql',
        '004_claims_and_evidence.sql',
        '005_web_search_query_results.sql',
      ]) {
        const sql = readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf-8');
        await db.query(sql);
      }
      await db.query(`
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
      ]) {
        await db.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [filename]);
      }

      // Plant an orphaned web_search_query row: generation_run_id points at nothing, which was
      // legal under 005's bare-UUID-no-FK column.
      const investigation = await db.query(
        `INSERT INTO investigation (id) VALUES (gen_random_uuid()) RETURNING id`,
      );
      const orphanGenerationRunId = '00000000-0000-0000-0000-000000000000';
      const orphanQuery = await db.query(
        `INSERT INTO web_search_query
           (id, investigation_id, generation_run_id, query, performed_at)
         VALUES (gen_random_uuid(), $1, $2, 'orphaned pre-006 row', now())
         RETURNING id`,
        [investigation.rows[0].id, orphanGenerationRunId],
      );

      // 006 must apply without throwing despite the orphan — this is the behavioral assertion
      // that a plain validating ADD CONSTRAINT would fail.
      const applied = await runMigrations(db);
      expect(applied).toEqual([
        '006_generation_run_provenance.sql',
        '007_problem_brief_and_versioning.sql',
        '008_reconcile_brief_versioning_constraints.sql',
      ]);

      // The orphaned row is untouched (never silently dropped) and the constraint exists, marked
      // NOT VALID (convalidated = false) rather than validated.
      const orphanStillPresent = await db.query(
        `SELECT 1 FROM web_search_query WHERE id = $1`,
        [orphanQuery.rows[0].id],
      );
      expect(orphanStillPresent.rowCount).toBe(1);

      const constraint = await db.query(
        `SELECT convalidated FROM pg_constraint
         WHERE conname = 'web_search_query_generation_run_id_fkey'
           AND conrelid = 'web_search_query'::regclass`,
      );
      expect(constraint.rowCount).toBe(1);
      expect(constraint.rows[0].convalidated).toBe(false);

      // Enforcement going forward: a NEW row with a nonexistent generation_run_id is rejected.
      await expect(
        db.query(
          `INSERT INTO web_search_query
             (id, investigation_id, generation_run_id, query, performed_at)
           VALUES (gen_random_uuid(), $1, gen_random_uuid(), 'should be rejected', now())`,
          [investigation.rows[0].id],
        ),
      ).rejects.toThrow();
    } finally {
      await db.query(`DROP SCHEMA "${schema}" CASCADE`);
      await db.end();
    }
  });

  // 007/008 — Brief versioning constraints. QC found that 007 shipped with ZERO dedicated
  // constraint tests (only its filename was added to the expected-applied-array literals above),
  // so the full suite passed identically with and without its five new constraints. The exact
  // failure that occurred in the dev DB was a constraint present under the RIGHT NAME but the
  // WRONG DEFINITION (six FKs wrongly DEFERRABLE INITIALLY DEFERRED, six CHECKs missing outright)
  // — a name-existence check would not have caught it, so these tests assert name AND definition
  // AND deferrability against pg_constraint directly, then drive the constraints behaviorally.
  it('007/008 — every brief-versioning FK/CHECK/UNIQUE constraint exists, by name, by definition, and by deferrability', async () => {
    const schema = 'migrate_test_007_008_constraint_catalog';
    const db = await schemaPool(schema);
    try {
      const applied = await runMigrations(db);
      expect(applied).toContain('007_problem_brief_and_versioning.sql');
      expect(applied).toContain('008_reconcile_brief_versioning_constraints.sql');

      async function getConstraint(
        table: string,
        name: string,
      ): Promise<{ contype: string; condeferrable: boolean; def: string } | null> {
        const result = await db.query<{ contype: string; condeferrable: boolean; def: string }>(
          `SELECT contype, condeferrable, pg_get_constraintdef(oid) AS def
           FROM pg_constraint WHERE conname = $1 AND conrelid = $2::regclass`,
          [name, table],
        );
        return result.rows[0] ?? null;
      }

      // The six brief_version_id -> brief_version(id) FKs: this is the EXACT defect the dev DB
      // carried (present under the right name, wrongly DEFERRABLE INITIALLY DEFERRED). Corrected
      // 007 declares all six as plain, non-deferrable FKs (007's own header note; 008 §Step 2).
      const brieFkChildTables = [
        'problem_statement',
        'negative_finding',
        'demand_signal',
        'existing_solution',
        'gap_hypothesis',
        'personal_pull_note',
      ];
      for (const table of brieFkChildTables) {
        const c = await getConstraint(table, `${table}_brief_version_id_fkey`);
        expect(c, `${table}_brief_version_id_fkey should exist`).not.toBeNull();
        expect(c!.contype).toBe('f');
        expect(c!.condeferrable, `${table}_brief_version_id_fkey must be non-deferrable`).toBe(false);
        expect(c!.def).toMatch(/REFERENCES brief_version\(id\)/);
      }

      // Other named FKs 007/008 own.
      const problemBriefFk = await getConstraint('problem_brief', 'problem_brief_current_version_id_fkey');
      expect(problemBriefFk).not.toBeNull();
      expect(problemBriefFk!.contype).toBe('f');
      expect(problemBriefFk!.condeferrable).toBe(false);
      expect(problemBriefFk!.def).toMatch(/REFERENCES brief_version\(id\)/);

      const genRunFk = await getConstraint('generation_run', 'generation_run_brief_version_id_fkey');
      expect(genRunFk).not.toBeNull();
      expect(genRunFk!.contype).toBe('f');
      expect(genRunFk!.condeferrable).toBe(false);
      expect(genRunFk!.def).toMatch(/REFERENCES brief_version\(id\)/);

      // UNIQUE(brief_version.generation_run_id) — backstop against two BriefVersions claiming the
      // same GenerationRun as provenance.
      const briefVersionRunUnique = await getConstraint('brief_version', 'brief_version_generation_run_id_unique');
      expect(briefVersionRunUnique).not.toBeNull();
      expect(briefVersionRunUnique!.contype).toBe('u');
      expect(briefVersionRunUnique!.def).toMatch(/UNIQUE \(generation_run_id\)/);

      // Non-empty-array CHECKs (finding 11).
      const nonEmptyArrayChecks: [string, string, string][] = [
        ['brief_version', 'brief_version_problem_statement_ids_non_empty', 'problem_statement_ids'],
        ['brief_version', 'brief_version_claim_version_ids_non_empty', 'claim_version_ids'],
        ['problem_statement', 'problem_statement_supporting_claims_non_empty', 'supporting_claim_version_ids'],
        ['demand_signal', 'demand_signal_evidence_non_empty', 'evidence_item_ids'],
        ['existing_solution', 'existing_solution_evidence_non_empty', 'evidence_item_ids'],
        ['gap_hypothesis', 'gap_hypothesis_evidence_non_empty', 'evidence_item_ids'],
      ];
      for (const [table, name, column] of nonEmptyArrayChecks) {
        const c = await getConstraint(table, name);
        expect(c, `${name} should exist`).not.toBeNull();
        expect(c!.contype).toBe('c');
        expect(c!.def).toContain(column);
        expect(c!.def).toMatch(/array_length/);
      }

      // Whitespace-only-rejection CHECKs — the six 008 found entirely absent from the quarantined
      // shape, plus the two 007 always declared inline (negative_finding.statement,
      // demand_signal is enum-only so excluded here).
      const whitespaceChecks: [string, string, string][] = [
        ['problem_statement', 'problem_statement_who_experiences_it_check', 'who_experiences_it'],
        ['problem_statement', 'problem_statement_context_or_workflow_check', 'context_or_workflow'],
        ['problem_statement', 'problem_statement_consequence_or_friction_check', 'consequence_or_friction'],
        ['existing_solution', 'existing_solution_name_check', 'name'],
        ['existing_solution', 'existing_solution_what_it_addresses_check', 'what_it_addresses'],
        ['existing_solution', 'existing_solution_how_people_cope_now_check', 'how_people_cope_now'],
        ['existing_solution', 'existing_solution_where_its_inadequate_check', 'where_its_inadequate'],
        ['gap_hypothesis', 'gap_hypothesis_statement_check', 'statement'],
        ['personal_pull_note', 'personal_pull_note_text_check', 'text'],
        ['negative_finding', 'negative_finding_statement_check', 'statement'],
      ];
      for (const [table, name, column] of whitespaceChecks) {
        const c = await getConstraint(table, name);
        expect(c, `${name} should exist`).not.toBeNull();
        expect(c!.contype).toBe('c');
        expect(c!.def).toContain(column);
        expect(c!.def).toMatch(/> 0/);
      }

      // Conditional-required 'other'-shaped label CHECKs (finding 11).
      const otherLabelType = await getConstraint('demand_signal', 'demand_signal_other_type_label_required');
      expect(otherLabelType).not.toBeNull();
      expect(otherLabelType!.contype).toBe('c');
      expect(otherLabelType!.def).toContain('other_type_label');
      expect(otherLabelType!.def).toContain('other-observed-behavior');

      const otherLabelCategory = await getConstraint('gap_hypothesis', 'gap_hypothesis_other_category_label_required');
      expect(otherLabelCategory).not.toBeNull();
      expect(otherLabelCategory!.contype).toBe('c');
      expect(otherLabelCategory!.def).toContain('other_category_label');
      expect(otherLabelCategory!.def).toContain("'other'");

      // Enum CHECKs.
      const negativeFindingElement = await getConstraint('negative_finding', 'negative_finding_element_check');
      expect(negativeFindingElement).not.toBeNull();
      expect(negativeFindingElement!.def).toMatch(/'evidence'/);
      expect(negativeFindingElement!.def).toMatch(/'demand-signal-type'/);
      expect(negativeFindingElement!.def).toMatch(/'existing-solution'/);
      expect(negativeFindingElement!.def).toMatch(/'gap-hypothesis'/);

      // UNIQUE(brief_version_id, element) on negative_finding.
      const negativeFindingUnique = await getConstraint(
        'negative_finding',
        'negative_finding_brief_version_id_element_key',
      );
      expect(negativeFindingUnique).not.toBeNull();
      expect(negativeFindingUnique!.contype).toBe('u');
    } finally {
      await db.query(`DROP SCHEMA "${schema}" CASCADE`);
      await db.end();
    }
  });

  it('007/008 — brief-versioning constraints are enforced behaviorally: whitespace-only text, empty arrays, conditional other_*_label fields, the generation_run_id UNIQUE, and immutability triggers all reject the violating write', async () => {
    const schema = 'migrate_test_007_008_behavioral';
    const db = await schemaPool(schema);
    try {
      await runMigrations(db);

      const investigation = await db.query<{ id: string }>(
        `INSERT INTO investigation (id) VALUES (gen_random_uuid()) RETURNING id`,
      );
      const investigationId = investigation.rows[0].id;

      async function seedGenerationRun(): Promise<string> {
        const run = await db.query<{ id: string }>(
          `INSERT INTO generation_run (investigation_id, outcome, started_at, runtime_identifier)
           VALUES ($1, 'in-progress', now(), 'test') RETURNING id`,
          [investigationId],
        );
        return run.rows[0].id;
      }

      const problemBrief = await db.query<{ id: string }>(
        `INSERT INTO problem_brief (investigation_id) VALUES ($1) RETURNING id`,
        [investigationId],
      );
      const problemBriefId = problemBrief.rows[0].id;

      async function seedValidBriefVersion(versionNumber: number): Promise<string> {
        const generationRunId = await seedGenerationRun();
        const bv = await db.query<{ id: string }>(
          `INSERT INTO brief_version
             (problem_brief_id, version_number, generation_run_id,
              problem_statement_ids, claim_version_ids,
              demand_confidence_classification, uncertainty_statement, recommendation)
           VALUES ($1, $2, $3, ARRAY[gen_random_uuid()], ARRAY[gen_random_uuid()], '{}', '{}', '{}')
           RETURNING id`,
          [problemBriefId, versionNumber, generationRunId],
        );
        return bv.rows[0].id;
      }

      const briefVersionId = await seedValidBriefVersion(1);

      // ---- Non-empty-array CHECKs ----
      await expect(
        db.query(
          `INSERT INTO brief_version
             (problem_brief_id, version_number, generation_run_id,
              problem_statement_ids, claim_version_ids,
              demand_confidence_classification, uncertainty_statement, recommendation)
           VALUES ($1, 2, $2, ARRAY[]::uuid[], ARRAY[gen_random_uuid()], '{}', '{}', '{}')`,
          [problemBriefId, await seedGenerationRun()],
        ),
      ).rejects.toThrow();

      await expect(
        db.query(
          `INSERT INTO demand_signal (brief_version_id, type, evidence_item_ids)
           VALUES ($1, 'recurring-complaints', ARRAY[]::uuid[])`,
          [briefVersionId],
        ),
      ).rejects.toThrow();

      // ---- Whitespace-only text rejection ----
      await expect(
        db.query(
          `INSERT INTO problem_statement
             (brief_version_id, who_experiences_it, context_or_workflow, consequence_or_friction,
              supporting_claim_version_ids)
           VALUES ($1, '   ', 'workflow', 'friction', ARRAY[gen_random_uuid()])`,
          [briefVersionId],
        ),
      ).rejects.toThrow();

      await expect(
        db.query(
          `INSERT INTO existing_solution
             (brief_version_id, name, what_it_addresses, how_people_cope_now, where_its_inadequate,
              evidence_item_ids)
           VALUES ($1, '  ', 'x', 'y', 'z', ARRAY[gen_random_uuid()])`,
          [briefVersionId],
        ),
      ).rejects.toThrow();

      // ---- Conditional other_*_label required ----
      await expect(
        db.query(
          `INSERT INTO demand_signal (brief_version_id, type, other_type_label, evidence_item_ids)
           VALUES ($1, 'other-observed-behavior', NULL, ARRAY[gen_random_uuid()])`,
          [briefVersionId],
        ),
      ).rejects.toThrow();
      // Valid counterpart proves the CHECK is conditional, not an outright ban on this type.
      await expect(
        db.query(
          `INSERT INTO demand_signal (brief_version_id, type, other_type_label, evidence_item_ids)
           VALUES ($1, 'other-observed-behavior', 'a real label', ARRAY[gen_random_uuid()])`,
          [briefVersionId],
        ),
      ).resolves.toBeDefined();

      await expect(
        db.query(
          `INSERT INTO gap_hypothesis (brief_version_id, category, other_category_label, statement, evidence_item_ids)
           VALUES ($1, 'other', NULL, 'a gap', ARRAY[gen_random_uuid()])`,
          [briefVersionId],
        ),
      ).rejects.toThrow();

      // ---- UNIQUE(brief_version.generation_run_id) ----
      const reusedGenerationRunId = await seedGenerationRun();
      await db.query(
        `INSERT INTO brief_version
           (problem_brief_id, version_number, generation_run_id,
            problem_statement_ids, claim_version_ids,
            demand_confidence_classification, uncertainty_statement, recommendation)
         VALUES ($1, 3, $2, ARRAY[gen_random_uuid()], ARRAY[gen_random_uuid()], '{}', '{}', '{}')`,
        [problemBriefId, reusedGenerationRunId],
      );
      await expect(
        db.query(
          `INSERT INTO brief_version
             (problem_brief_id, version_number, generation_run_id,
              problem_statement_ids, claim_version_ids,
              demand_confidence_classification, uncertainty_statement, recommendation)
           VALUES ($1, 4, $2, ARRAY[gen_random_uuid()], ARRAY[gen_random_uuid()], '{}', '{}', '{}')`,
          [problemBriefId, reusedGenerationRunId],
        ),
      ).rejects.toThrow();

      // ---- Immutability triggers (brief_version, and problem_brief's narrower substantive guard) ----
      await expect(
        db.query(`UPDATE brief_version SET version_number = 99 WHERE id = $1`, [briefVersionId]),
      ).rejects.toThrow();
      await expect(
        db.query(`DELETE FROM brief_version WHERE id = $1`, [briefVersionId]),
      ).rejects.toThrow();

      // problem_brief permits current_version_id to change (the one documented exception)...
      await expect(
        db.query(`UPDATE problem_brief SET current_version_id = $1 WHERE id = $2`, [briefVersionId, problemBriefId]),
      ).resolves.toBeDefined();
      // ...but rejects any mutation of investigation_id/created_at.
      await expect(
        db.query(`UPDATE problem_brief SET investigation_id = gen_random_uuid() WHERE id = $1`, [problemBriefId]),
      ).rejects.toThrow();
    } finally {
      await db.query(`DROP SCHEMA "${schema}" CASCADE`);
      await db.end();
    }
  });
});
