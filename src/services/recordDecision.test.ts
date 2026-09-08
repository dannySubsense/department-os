import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';
import {
  recordDecision,
  WatchRequiresConditionError,
  BriefVersionNotFoundError,
} from './recordDecision.js';

// Integration coverage for recordDecision (04-ROADMAP.md C2-S5 Tests list, 02-ARCHITECTURE.md §4.3).

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE reconsideration_condition, decision, negative_finding, gap_hypothesis,
              existing_solution, demand_signal, problem_statement, brief_version, problem_brief,
              generation_step, generation_run, claim_version_evidence, evidence_item, claim_version,
              claim, source_artifact, submission, investigation CASCADE`,
  );
});

/** Same minimal direct-seed shape used across this checkpoint's other service tests
 *  (getBriefForReview.test.ts) — a real, persisted brief_version row to record Decisions against. */
async function seedBriefVersion(): Promise<{ investigationId: string; briefVersionId: string }> {
  const submission = await submitSources({ origin: 'human', artifacts: [{ type: 'text', raw: 'seed' }] });
  const investigationId = submission.investigationId;

  const runResult = await pool.query<{ id: string }>(
    `INSERT INTO generation_run (investigation_id, outcome, started_at, completed_at, runtime_identifier)
     VALUES ($1, 'succeeded', now(), now(), 'test-runtime') RETURNING id`,
    [investigationId],
  );
  const briefResult = await pool.query<{ id: string }>(
    `INSERT INTO problem_brief (investigation_id) VALUES ($1) RETURNING id`,
    [investigationId],
  );
  const problemBriefId = briefResult.rows[0].id;

  const briefVersionResult = await pool.query<{ id: string }>(
    `INSERT INTO brief_version
       (problem_brief_id, version_number, generation_run_id, problem_statement_ids, claim_version_ids,
        demand_signal_ids, demand_confidence_classification, existing_solution_ids, gap_hypothesis_ids,
        uncertainty_statement, recommendation, personal_pull_note_ids)
     VALUES ($1, 1, $2, $3, $4, '{}', '{}'::jsonb, '{}', '{}', '{}'::jsonb, '{}'::jsonb, '{}')
     RETURNING id`,
    [problemBriefId, runResult.rows[0].id, [randomUUID()], [randomUUID()]],
  );
  const briefVersionId = briefVersionResult.rows[0].id;
  await pool.query(`UPDATE problem_brief SET current_version_id = $1 WHERE id = $2`, [
    briefVersionId,
    problemBriefId,
  ]);
  return { investigationId, briefVersionId };
}

const NONEXISTENT_BRIEF_VERSION_ID = '00000000-0000-0000-0000-000000000000';

describe('recordDecision', () => {
  it('persists an Approve decision correctly, with no reconsideration conditions and no decidedBy field', async () => {
    const { briefVersionId } = await seedBriefVersion();

    const decision = await recordDecision({
      briefVersionId,
      decision: 'Approve',
      rationale: 'Evidence supports the problem.',
    });

    expect(decision.decision).toBe('Approve');
    expect(decision.briefVersionId).toBe(briefVersionId);
    expect(decision.rationale).toBe('Evidence supports the problem.');
    expect(decision.reconsiderationConditionIds).toEqual([]);
    expect((decision as unknown as { decidedBy?: unknown }).decidedBy).toBeUndefined();

    const row = await pool.query(`SELECT * FROM decision WHERE id = $1`, [decision.id]);
    expect(row.rowCount).toBe(1);
    expect(row.rows[0].decision).toBe('Approve');
    expect(Object.keys(row.rows[0])).not.toContain('decided_by');
  });

  it('never accepts a decidedBy-shaped input — a caller-supplied decidedBy field is silently ignored, never persisted', async () => {
    const { briefVersionId } = await seedBriefVersion();
    const decision = await recordDecision({
      briefVersionId,
      decision: 'Approve',
      // @ts-expect-error — decidedBy is not part of RecordDecisionInput; verifying runtime behavior
      // if a caller bypasses the type system (e.g. a malformed route handler) and supplies one anyway.
      decidedBy: 'someone',
    });
    const row = await pool.query(`SELECT * FROM decision WHERE id = $1`, [decision.id]);
    expect(Object.keys(row.rows[0])).not.toContain('decided_by');
  });

  it('persists a Reject decision correctly', async () => {
    const { briefVersionId } = await seedBriefVersion();
    const decision = await recordDecision({ briefVersionId, decision: 'Reject' });
    expect(decision.decision).toBe('Reject');
    expect(decision.reconsiderationConditionIds).toEqual([]);
  });

  it('persists a Watch decision with >=1 real reconsideration condition, storing resolved condition content', async () => {
    const { briefVersionId } = await seedBriefVersion();
    const decision = await recordDecision({
      briefVersionId,
      decision: 'Watch',
      reconsiderationConditions: [
        { type: 'new-evidence', description: 'a competitor launches a similar product' },
      ],
    });

    expect(decision.decision).toBe('Watch');
    expect(decision.reconsiderationConditionIds).toHaveLength(1);

    const conditionRow = await pool.query(
      `SELECT type, description FROM reconsideration_condition WHERE id = $1`,
      [decision.reconsiderationConditionIds[0]],
    );
    expect(conditionRow.rows[0].type).toBe('new-evidence');
    expect(conditionRow.rows[0].description).toBe('a competitor launches a similar product');
  });

  it('rejects a zero-condition Watch attempt with WatchRequiresConditionError and writes no row to either table (transaction rollback verified)', async () => {
    const { briefVersionId } = await seedBriefVersion();

    await expect(recordDecision({ briefVersionId, decision: 'Watch' })).rejects.toBeInstanceOf(
      WatchRequiresConditionError,
    );

    const decisionCount = await pool.query(`SELECT count(*) FROM decision WHERE brief_version_id = $1`, [
      briefVersionId,
    ]);
    expect(decisionCount.rows[0].count).toBe('0');
    const conditionCount = await pool.query(`SELECT count(*) FROM reconsideration_condition`);
    expect(conditionCount.rows[0].count).toBe('0');
  });

  it('rejects a whitespace-only-condition Watch attempt with WatchRequiresConditionError and writes no row to either table', async () => {
    const { briefVersionId } = await seedBriefVersion();

    await expect(
      recordDecision({
        briefVersionId,
        decision: 'Watch',
        reconsiderationConditions: [{ type: 'new-evidence', description: '   ' }],
      }),
    ).rejects.toBeInstanceOf(WatchRequiresConditionError);

    const decisionCount = await pool.query(`SELECT count(*) FROM decision WHERE brief_version_id = $1`, [
      briefVersionId,
    ]);
    expect(decisionCount.rows[0].count).toBe('0');
    const conditionCount = await pool.query(`SELECT count(*) FROM reconsideration_condition`);
    expect(conditionCount.rows[0].count).toBe('0');
  });

  it('SOL-MEDIUM-5: throws BriefVersionNotFoundError with zero writes to either table for a briefVersionId that does not resolve to any brief_version row', async () => {
    await expect(
      recordDecision({ briefVersionId: NONEXISTENT_BRIEF_VERSION_ID, decision: 'Approve' }),
    ).rejects.toBeInstanceOf(BriefVersionNotFoundError);

    const decisionCount = await pool.query(`SELECT count(*) FROM decision`);
    expect(decisionCount.rows[0].count).toBe('0');
    const conditionCount = await pool.query(`SELECT count(*) FROM reconsideration_condition`);
    expect(conditionCount.rows[0].count).toBe('0');
  });

  it('SOL-MEDIUM-5 ordering: a request supplying BOTH a nonexistent briefVersionId AND a zero-condition Watch throws BriefVersionNotFoundError, never WatchRequiresConditionError (existence checked first)', async () => {
    let thrown: unknown;
    try {
      await recordDecision({ briefVersionId: NONEXISTENT_BRIEF_VERSION_ID, decision: 'Watch' });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(BriefVersionNotFoundError);
    expect(thrown).not.toBeInstanceOf(WatchRequiresConditionError);
  });
});
