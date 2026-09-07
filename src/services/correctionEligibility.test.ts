import { randomUUID } from 'node:crypto';
import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';
import {
  hasUnattemptedCorrectionSnapshot,
  getCandidateCorrectionSourceIds,
} from './getInvestigationWorkspace.js';

/** C2-S3 §4.8 — real-row coverage for the eligibility/consumption-ledger mechanism
 * (04-ROADMAP.md C2-S3 Tests list): `hasUnattemptedCorrectionSnapshot`/
 * `getCandidateCorrectionSourceIds` against real `problem_brief`/`brief_version`/
 * `generation_run_consumed_source` rows — no mocking of the query itself, since the whole point
 * under test is the recursive-CTE lineage traversal and the hash-equality predicate. */

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE generation_run_consumed_source, brief_version, problem_brief,
              generation_step, generation_run, source_artifact, submission, investigation CASCADE`,
  );
});

async function seedInvestigation(): Promise<string> {
  const submission = await submitSources({ origin: 'human', artifacts: [{ type: 'text', raw: 'seed' }] });
  return submission.investigationId;
}

/** Inserts a real, resolved, operator-submitted SourceArtifact with the given content hash — the
 * exact shape `getCandidateCorrectionSourceIds`'s WHERE clause requires (`origin = 'submitted'`,
 * `resolution_status = 'content-retrieved'`, non-null `resolved_content_hash`). `origin =
 * 'submitted'` requires a real, non-null `submission_id` FK
 * (`source_artifact_submission_id_matches_origin`), so a real `submission` row is created first. */
async function insertSubmittedResolvedSource(
  investigationId: string,
  hash: string,
  canonicalUrl: string | null = null,
): Promise<string> {
  const submissionResult = await pool.query<{ id: string }>(
    `INSERT INTO submission (investigation_id, origin) VALUES ($1, 'human') RETURNING id`,
    [investigationId],
  );
  const result = await pool.query<{ id: string }>(
    `INSERT INTO source_artifact
       (investigation_id, submission_id, type, raw, origin, resolution_status, resolution_resolved_at,
        resolved_content, resolved_content_hash, canonical_url)
     VALUES ($1, $2, 'url', $3, 'submitted', 'content-retrieved', now(), 'content', $4, $5)
     RETURNING id`,
    [investigationId, submissionResult.rows[0].id, `https://example.com/${hash}`, hash, canonicalUrl],
  );
  return result.rows[0].id;
}

async function insertGenerationRun(investigationId: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO generation_run (investigation_id, outcome, started_at, completed_at, runtime_identifier)
     VALUES ($1, 'succeeded', now(), now(), 'test-runtime')
     RETURNING id`,
    [investigationId],
  );
  return result.rows[0].id;
}

/** `problem_brief.current_version_id` has a deferred FK to `brief_version` and `brief_version`
 * requires a real `problem_brief_id` — the two rows are necessarily created out of order: this
 * helper creates the ProblemBrief with a null pointer first; `pointBriefAtVersion` sets the real
 * pointer once the lineage's final version exists. */
async function insertProblemBrief(investigationId: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO problem_brief (investigation_id, current_version_id) VALUES ($1, NULL) RETURNING id`,
    [investigationId],
  );
  return result.rows[0].id;
}

async function pointBriefAtVersion(problemBriefId: string, briefVersionId: string): Promise<void> {
  await pool.query(`UPDATE problem_brief SET current_version_id = $2 WHERE id = $1`, [
    problemBriefId,
    briefVersionId,
  ]);
}

/** Non-empty-array/JSONB NOT NULL columns are satisfied with minimal placeholder values; none of
 * this test's assertions read them — only the lineage-traversal columns
 * (`supersedes_version_id`/`generation_run_id`) matter here. */
async function insertBriefVersion(
  problemBriefId: string,
  generationRunId: string,
  versionNumber: number,
  supersedesVersionId: string | null,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO brief_version
       (problem_brief_id, generation_run_id, version_number, supersedes_version_id,
        problem_statement_ids, claim_version_ids, demand_confidence_classification,
        uncertainty_statement, recommendation)
     VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)
     RETURNING id`,
    [problemBriefId, generationRunId, versionNumber, supersedesVersionId, [randomUUID()], [randomUUID()]],
  );
  return result.rows[0].id;
}

async function ledgerConsumedSource(
  generationRunId: string,
  sourceArtifactId: string,
  correctionTargetBriefVersionId: string | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO generation_run_consumed_source
       (generation_run_id, source_artifact_id, correction_target_brief_version_id)
     VALUES ($1, $2, $3)`,
    [generationRunId, sourceArtifactId, correctionTargetBriefVersionId],
  );
}

describe('hasUnattemptedCorrectionSnapshot / getCandidateCorrectionSourceIds', () => {
  it('returns false / empty without a ProblemBrief', async () => {
    const investigationId = await seedInvestigation();
    await insertSubmittedResolvedSource(investigationId, 'hash-a');

    expect(await hasUnattemptedCorrectionSnapshot(investigationId)).toBe(false);
    expect(await getCandidateCorrectionSourceIds(investigationId)).toEqual([]);
  });

  it('returns true for a distinct hash not yet ledgered against the current lineage', async () => {
    const investigationId = await seedInvestigation();
    const problemBriefId = await insertProblemBrief(investigationId);
    const run1 = await insertGenerationRun(investigationId);
    const v1 = await insertBriefVersion(problemBriefId, run1, 1, null);
    await pointBriefAtVersion(problemBriefId, v1);

    const originalSourceId = await insertSubmittedResolvedSource(investigationId, 'hash-original');
    await ledgerConsumedSource(run1, originalSourceId, null);

    const newSourceId = await insertSubmittedResolvedSource(investigationId, 'hash-new');

    expect(await hasUnattemptedCorrectionSnapshot(investigationId)).toBe(true);
    expect(await getCandidateCorrectionSourceIds(investigationId)).toEqual([newSourceId]);
  });

  it('excludes an equal-hash row regardless of distinct row id, URL spelling, or source type', async () => {
    const investigationId = await seedInvestigation();
    const problemBriefId = await insertProblemBrief(investigationId);
    const run1 = await insertGenerationRun(investigationId);
    const v1 = await insertBriefVersion(problemBriefId, run1, 1, null);
    await pointBriefAtVersion(problemBriefId, v1);

    const originalSourceId = await insertSubmittedResolvedSource(
      investigationId,
      'shared-hash',
      'https://example.com/canonical',
    );
    await ledgerConsumedSource(run1, originalSourceId, null);

    // A different row id, a different URL spelling/type, but the SAME resolved_content_hash.
    await insertSubmittedResolvedSource(investigationId, 'shared-hash', 'https://example.com/redirect-alias');

    expect(await hasUnattemptedCorrectionSnapshot(investigationId)).toBe(false);
    expect(await getCandidateCorrectionSourceIds(investigationId)).toEqual([]);
  });

  it('allows a different hash at the SAME canonical URL (changed content)', async () => {
    const investigationId = await seedInvestigation();
    const problemBriefId = await insertProblemBrief(investigationId);
    const run1 = await insertGenerationRun(investigationId);
    const v1 = await insertBriefVersion(problemBriefId, run1, 1, null);
    await pointBriefAtVersion(problemBriefId, v1);

    const originalSourceId = await insertSubmittedResolvedSource(
      investigationId,
      'hash-v1',
      'https://example.com/same-url',
    );
    await ledgerConsumedSource(run1, originalSourceId, null);

    const changedContentSourceId = await insertSubmittedResolvedSource(
      investigationId,
      'hash-v2-changed-content',
      'https://example.com/same-url',
    );

    expect(await getCandidateCorrectionSourceIds(investigationId)).toEqual([changedContentSourceId]);
  });

  it('required correction-of-a-correction lineage regression: a 3-version-deep lineage excludes every ancestor-consumed hash', async () => {
    const investigationId = await seedInvestigation();
    const problemBriefId = await insertProblemBrief(investigationId);

    // v1's producing run consumes source A.
    const runV1 = await insertGenerationRun(investigationId);
    const v1 = await insertBriefVersion(problemBriefId, runV1, 1, null);
    const sourceA = await insertSubmittedResolvedSource(investigationId, 'hash-a');
    await ledgerConsumedSource(runV1, sourceA, null);

    // Distinct source B produces v2 (a correction targeting v1).
    const runV2 = await insertGenerationRun(investigationId);
    const v2 = await insertBriefVersion(problemBriefId, runV2, 2, v1);
    const sourceB = await insertSubmittedResolvedSource(investigationId, 'hash-b');
    await ledgerConsumedSource(runV2, sourceB, v1);

    // Distinct source C produces v3 (a correction targeting v2) — now current.
    const runV3 = await insertGenerationRun(investigationId);
    const v3 = await insertBriefVersion(problemBriefId, runV3, 3, v2);
    const sourceC = await insertSubmittedResolvedSource(investigationId, 'hash-c');
    await ledgerConsumedSource(runV3, sourceC, v2);

    await pointBriefAtVersion(problemBriefId, v3);

    // Resubmitting A or B (same hash, new rows) remains ineligible while v3 is current — a
    // one-producing-run-deep query would incorrectly pass this (only checking runV3/sourceC).
    await insertSubmittedResolvedSource(investigationId, 'hash-a');
    await insertSubmittedResolvedSource(investigationId, 'hash-b');

    expect(await getCandidateCorrectionSourceIds(investigationId)).toEqual([]);
    expect(await hasUnattemptedCorrectionSnapshot(investigationId)).toBe(false);

    // A genuinely new hash remains eligible.
    const sourceD = await insertSubmittedResolvedSource(investigationId, 'hash-d');
    expect(await getCandidateCorrectionSourceIds(investigationId)).toEqual([sourceD]);
  });
});
