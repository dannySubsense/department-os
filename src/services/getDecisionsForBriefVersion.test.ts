import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';
import { recordDecision } from './recordDecision.js';
import { getDecisionsForBriefVersion } from './getDecisionsForBriefVersion.js';

// Integration coverage for getDecisionsForBriefVersion (04-ROADMAP.md C2-S5 Tests list,
// 02-ARCHITECTURE.md §4.5).

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

async function seedBriefVersion(): Promise<string> {
  const submission = await submitSources({ origin: 'human', artifacts: [{ type: 'text', raw: 'seed' }] });
  const runResult = await pool.query<{ id: string }>(
    `INSERT INTO generation_run (investigation_id, outcome, started_at, completed_at, runtime_identifier)
     VALUES ($1, 'succeeded', now(), now(), 'test-runtime') RETURNING id`,
    [submission.investigationId],
  );
  const briefResult = await pool.query<{ id: string }>(
    `INSERT INTO problem_brief (investigation_id) VALUES ($1) RETURNING id`,
    [submission.investigationId],
  );
  const briefVersionResult = await pool.query<{ id: string }>(
    `INSERT INTO brief_version
       (problem_brief_id, version_number, generation_run_id, problem_statement_ids, claim_version_ids,
        demand_signal_ids, demand_confidence_classification, existing_solution_ids, gap_hypothesis_ids,
        uncertainty_statement, recommendation, personal_pull_note_ids)
     VALUES ($1, 1, $2, $3, $4, '{}', '{}'::jsonb, '{}', '{}', '{}'::jsonb, '{}'::jsonb, '{}')
     RETURNING id`,
    [briefResult.rows[0].id, runResult.rows[0].id, [randomUUID()], [randomUUID()]],
  );
  return briefVersionResult.rows[0].id;
}

describe('getDecisionsForBriefVersion', () => {
  it('returns an empty array for a BriefVersion with zero Decisions', async () => {
    const briefVersionId = await seedBriefVersion();
    expect(await getDecisionsForBriefVersion(briefVersionId)).toEqual([]);
  });

  it('returns decidedAt ASC and aggregates resolved reconsideration-condition content, never a bare id', async () => {
    const briefVersionId = await seedBriefVersion();
    // decision is append-only (migration 010's reject_update_or_delete trigger) — seed the
    // earlier row directly via INSERT with a backdated decided_at instead of recordDecision +
    // UPDATE, so ASC ordering is unambiguous without touching the immutable table.
    const firstResult = await pool.query<{ id: string; decided_at: Date }>(
      `INSERT INTO decision (brief_version_id, decision, decided_at)
       VALUES ($1, 'Approve', now() - interval '1 hour')
       RETURNING id, decided_at`,
      [briefVersionId],
    );
    const first = { id: firstResult.rows[0].id };
    const second = await recordDecision({
      briefVersionId,
      decision: 'Watch',
      reconsiderationConditions: [
        { type: 'other', otherTypeLabel: 'Custom trigger', description: 'a named custom event' },
      ],
    });

    const result = await getDecisionsForBriefVersion(briefVersionId);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(first.id);
    expect(result[1].id).toBe(second.id);
    expect(new Date(result[0].decidedAt).getTime()).toBeLessThan(new Date(result[1].decidedAt).getTime());

    expect(result[1].reconsiderationConditions).toHaveLength(1);
    const condition = result[1].reconsiderationConditions[0];
    expect(condition.type).toBe('other');
    expect(condition.otherTypeLabel).toBe('Custom trigger');
    expect(condition.description).toBe('a named custom event');
    // Never a bare id in place of resolved content (Finding 6).
    expect(condition).not.toHaveProperty('id');
    expect(typeof condition.description).toBe('string');
  });

  it('aggregates conditions via one query, not N+1 — exactly one pool.query call for a BriefVersion with multiple Decisions/conditions', async () => {
    const briefVersionId = await seedBriefVersion();
    await recordDecision({
      briefVersionId,
      decision: 'Watch',
      reconsiderationConditions: [
        { type: 'new-evidence', description: 'condition A' },
        { type: 'price-change', description: 'condition B' },
      ],
    });
    await recordDecision({ briefVersionId, decision: 'Approve' });

    const spy = vi.spyOn(pool, 'query');
    spy.mockClear();
    const result = await getDecisionsForBriefVersion(briefVersionId);
    expect(result).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
