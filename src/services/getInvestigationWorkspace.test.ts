import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';
import {
  getInvestigationWorkspace,
  computeLivenessState,
} from './getInvestigationWorkspace.js';

// Integration coverage for getInvestigationWorkspace and computeLivenessState
// (04-ROADMAP.md C2-S2 Tests list).

beforeEach(async () => {
  await pool.query(
    `TRUNCATE status_event, negative_finding, gap_hypothesis, existing_solution, demand_signal,
              problem_statement, brief_version, problem_brief,
              web_search_result, query_limitation, web_search_query, generation_step,
              generation_run, claim_version_evidence, evidence_item, claim_version, claim,
              source_artifact, submission, investigation
     CASCADE`,
  );
});

/** Same minimal direct-seed shape as getBriefForReview.test.ts's own helper — duplicated locally
 *  (test fixture code, not production surface) so a real `BriefVersion` chain can back
 *  `briefs[].assignedState`/`isSuperseded`/`forwardSupersededByVersionNumber` assertions. */
async function seedBriefVersion(options: {
  investigationId: string;
  sourceArtifactId: string;
  versionNumber: number;
  supersedesVersionId?: string | null;
}): Promise<string> {
  const runResult = await pool.query<{ id: string }>(
    `INSERT INTO generation_run (investigation_id, outcome, started_at, completed_at, runtime_identifier)
     VALUES ($1, 'succeeded', now(), now(), 'test-runtime') RETURNING id`,
    [options.investigationId],
  );

  let problemBriefId: string;
  const existingBrief = await pool.query<{ id: string }>(
    `SELECT id FROM problem_brief WHERE investigation_id = $1`,
    [options.investigationId],
  );
  if (existingBrief.rowCount && existingBrief.rowCount > 0) {
    problemBriefId = existingBrief.rows[0].id;
  } else {
    const briefResult = await pool.query<{ id: string }>(
      `INSERT INTO problem_brief (investigation_id) VALUES ($1) RETURNING id`,
      [options.investigationId],
    );
    problemBriefId = briefResult.rows[0].id;
  }

  const claimResult = await pool.query<{ id: string }>(`INSERT INTO claim DEFAULT VALUES RETURNING id`);
  const claimVersionResult = await pool.query<{ id: string }>(
    `INSERT INTO claim_version (claim_id, version_number, text) VALUES ($1, 1, 'claim text') RETURNING id`,
    [claimResult.rows[0].id],
  );
  const claimVersionId = claimVersionResult.rows[0].id;

  const briefVersionId = randomUUID();
  const problemStatementId = randomUUID();

  await pool.query(
    `INSERT INTO brief_version
       (id, problem_brief_id, version_number, supersedes_version_id, generation_run_id,
        problem_statement_ids, claim_version_ids, demand_signal_ids,
        demand_confidence_classification, existing_solution_ids, gap_hypothesis_ids,
        uncertainty_statement, recommendation, personal_pull_note_ids)
     VALUES ($1, $2, $3, $4, $5, $6, $7, '{}', $8::jsonb, '{}', '{}', $9::jsonb, $10::jsonb, '{}')`,
    [
      briefVersionId,
      problemBriefId,
      options.versionNumber,
      options.supersedesVersionId ?? null,
      runResult.rows[0].id,
      [problemStatementId],
      [claimVersionId],
      JSON.stringify({ briefVersionId, level: 'Emerging', narrative: 'n', citedDemandSignalIds: [] }),
      JSON.stringify({ briefVersionId, whatsUnknown: ['x'], whatWouldChangeConclusion: ['y'], whatsUndeterminable: ['z'] }),
      JSON.stringify({ briefVersionId, decision: 'Approve', rationale: 'Evidence supports the problem.' }),
    ],
  );

  await pool.query(
    `INSERT INTO problem_statement (id, brief_version_id, who_experiences_it, context_or_workflow,
       consequence_or_friction, supporting_claim_version_ids)
     VALUES ($1, $2, 'small teams', 'manual reconciliation', 'hours lost weekly', $3)`,
    [problemStatementId, briefVersionId, [claimVersionId]],
  );

  await pool.query(`UPDATE problem_brief SET current_version_id = $1 WHERE id = $2`, [
    briefVersionId,
    problemBriefId,
  ]);

  await pool.query(`UPDATE investigation SET problem_brief_id = $1 WHERE id = $2`, [
    problemBriefId,
    options.investigationId,
  ]);

  return briefVersionId;
}

afterAll(async () => {
  await pool.end();
});

async function insertGenerationRun(
  investigationId: string,
  outcome: 'in-progress' | 'succeeded' | 'failed',
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO generation_run (investigation_id, outcome, started_at, completed_at, runtime_identifier)
     VALUES ($1, $2, now(), $3, 'test-runtime')
     RETURNING id`,
    [investigationId, outcome, outcome === 'in-progress' ? null : new Date()],
  );
  return result.rows[0].id;
}

describe('computeLivenessState', () => {
  it('returns terminal with a null lastProgressAt for a succeeded run', () => {
    const result = computeLivenessState(
      {
        outcome: 'succeeded',
        leaseHeartbeatAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
      },
      [],
    );
    expect(result).toEqual({ livenessState: 'terminal', lastProgressAt: null });
  });

  it('returns terminal with a null lastProgressAt for a failed run', () => {
    const result = computeLivenessState(
      {
        outcome: 'failed',
        leaseHeartbeatAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
      },
      [],
    );
    expect(result).toEqual({ livenessState: 'terminal', lastProgressAt: null });
  });

  it('returns active on cold start (fewer than 2 recorded step-completion timestamps) regardless of silence length', () => {
    const startedAt = new Date(Date.now() - 100_000).toISOString();
    const heartbeat = new Date(Date.now() - 100_000).toISOString();
    const result = computeLivenessState(
      { outcome: 'in-progress', leaseHeartbeatAt: heartbeat, startedAt },
      [],
    );
    expect(result.livenessState).toBe('active');
    expect(result.lastProgressAt).toBe(heartbeat);

    const resultOneStep = computeLivenessState(
      { outcome: 'in-progress', leaseHeartbeatAt: heartbeat, startedAt },
      [new Date(Date.now() - 90_000).toISOString()],
    );
    expect(resultOneStep.livenessState).toBe('active');
  });

  it('returns active when current silence is within the observed cadence (relative, not a fixed threshold)', () => {
    const startedAt = new Date(Date.now() - 30_000).toISOString();
    const step1 = new Date(Date.now() - 20_000).toISOString(); // gap from start: 10s
    const step2 = new Date(Date.now() - 5_000).toISOString(); // gap: 15s, largest observed
    // current silence since step2 (heartbeat) is ~5s, well under 4x the 15s observed gap.
    const result = computeLivenessState(
      { outcome: 'in-progress', leaseHeartbeatAt: step2, startedAt },
      [step1, step2],
    );
    expect(result.livenessState).toBe('active');
    expect(result.lastProgressAt).toBe(step2);
  });

  it('returns stale-or-interrupted when current silence exceeds 4x the largest observed gap for this run', () => {
    const startedAt = new Date(Date.now() - 100_000).toISOString();
    const step1 = new Date(Date.now() - 95_000).toISOString(); // gap from start: 5s
    const step2 = new Date(Date.now() - 90_000).toISOString(); // gap: 5s, largest observed
    // heartbeat frozen at step2, so current silence is ~90s >> 4 * 5s = 20s.
    const result = computeLivenessState(
      { outcome: 'in-progress', leaseHeartbeatAt: step2, startedAt },
      [step1, step2],
    );
    expect(result.livenessState).toBe('stale-or-interrupted');
    expect(result.lastProgressAt).toBe(step2);
  });

  it('returns active for a degenerate zero-max-gap case (identical timestamps) rather than flagging stale', () => {
    const same = new Date(Date.now() - 50_000).toISOString();
    const result = computeLivenessState(
      { outcome: 'in-progress', leaseHeartbeatAt: same, startedAt: same },
      [same, same],
    );
    expect(result.livenessState).toBe('active');
  });
});

describe('getInvestigationWorkspace', () => {
  it('returns null for a nonexistent investigation id (catches only InvestigationNotFoundError)', async () => {
    const result = await getInvestigationWorkspace('00000000-0000-0000-0000-000000000000');
    expect(result).toBeNull();
  });

  it('returns a populated view for a real Investigation row', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'text', raw: 'some content' }],
    });

    const view = await getInvestigationWorkspace(submission.investigationId);

    expect(view).not.toBeNull();
    expect(view!.investigation.id).toBe(submission.investigationId);
    expect(view!.investigation.status).toBe('open');
    expect(view!.investigation.sourceCount).toBe(1);
    expect(view!.investigation.sources).toHaveLength(1);
    expect(view!.generationRuns).toEqual([]);
    expect(view!.latestGenerationRun).toBeNull();
    expect(view!.briefs).toEqual([]);
    expect(view!.decisionLineage).toEqual([]);
    expect(view!.generationEligible).toBe(true);
    expect(view!.newSourceSnapshotSinceCurrentBriefVersion).toBe(false);
  });

  it('rejects (does not convert to null) on an injected database/query failure', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'text', raw: 'content' }],
    });

    const spy = vi.spyOn(pool, 'query').mockRejectedValueOnce(new Error('connection reset'));
    await expect(getInvestigationWorkspace(submission.investigationId)).rejects.toThrow(
      'connection reset',
    );
    spy.mockRestore();
  });

  it('returns full real generation history including per-step validationRecords/toolInvocations and per-run webSearchQueries, never omitted for an Investigation that has this data persisted', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'text', raw: 'content' }],
    });
    const runId = await insertGenerationRun(submission.investigationId, 'succeeded');

    const stepData = {
      validationRecords: [
        {
          fieldPath: 'demandAnalyzer',
          toolName: 'demandAnalyzer',
          attempts: [
            {
              attemptNumber: 1,
              rawOutput: '{}',
              valid: true,
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              modelIdentifier: 'test-model',
            },
          ],
          finalOutcome: 'valid',
        },
      ],
      toolInvocations: [
        {
          toolName: 'web_search',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          outcome: 'retrieved',
        },
      ],
    };
    await pool.query(
      `INSERT INTO generation_step
         (generation_run_id, step_index, component, started_at, completed_at, outcome, step_data)
       VALUES ($1, 0, 'demandAnalyzer', now(), now(), 'succeeded', $2::jsonb)`,
      [runId, JSON.stringify(stepData)],
    );

    const queryResult = await pool.query<{ id: string }>(
      `INSERT INTO web_search_query (investigation_id, generation_run_id, query, performed_at, limitations)
       VALUES ($1, $2, 'test query', now(), '{}')
       RETURNING id`,
      [submission.investigationId, runId],
    );
    const queryId = queryResult.rows[0].id;
    // web_search_result_source_artifact_id_matches_status CHECK requires a non-null
    // source_artifact_id whenever status = 'retrieved'.
    const sourceArtifactResult = await pool.query<{ id: string }>(
      `INSERT INTO source_artifact (investigation_id, type, raw, origin)
       VALUES ($1, 'url', 'https://example.com/result', 'discovered')
       RETURNING id`,
      [submission.investigationId],
    );
    await pool.query(
      `INSERT INTO web_search_result (web_search_query_id, url, retrieved_at, status, source_artifact_id)
       VALUES ($1, 'https://example.com/result', now(), 'retrieved', $2)`,
      [queryId, sourceArtifactResult.rows[0].id],
    );

    const view = await getInvestigationWorkspace(submission.investigationId);

    expect(view!.generationRuns).toHaveLength(1);
    const run = view!.generationRuns[0];
    expect(run.steps).toHaveLength(1);
    expect(run.steps[0].validationRecords).toBeDefined();
    expect(run.steps[0].validationRecords!.length).toBeGreaterThan(0);
    expect(run.steps[0].toolInvocations).toBeDefined();
    expect(run.steps[0].toolInvocations!.length).toBeGreaterThan(0);
    expect(run.webSearchQueries).toHaveLength(1);
    expect(run.webSearchQueries[0].results).toHaveLength(1);
    expect(view!.latestGenerationRun).toEqual(run);
  });

  it("reports livenessState 'terminal' for every seeded succeeded/failed run", async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'text', raw: 'content' }],
    });
    await insertGenerationRun(submission.investigationId, 'succeeded');
    await insertGenerationRun(submission.investigationId, 'failed');

    const view = await getInvestigationWorkspace(submission.investigationId);
    expect(view!.generationRuns).toHaveLength(2);
    for (const run of view!.generationRuns) {
      expect(run.livenessState).toBe('terminal');
    }
  });

  it('briefs[].assignedState reflects a real seeded StatusEvent row (C2-S4)', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'text', raw: 'content' }],
    });
    const briefVersionId = await seedBriefVersion({
      investigationId: submission.investigationId,
      sourceArtifactId: submission.sourceArtifactIds[0],
      versionNumber: 1,
    });
    await pool.query(
      `INSERT INTO status_event (target_type, target_id, assigned_state, effective_at, recorded_by, reason)
       VALUES ('brief-version', $1, 'challenged', now(), 'test-operator', 'seeded for test')`,
      [briefVersionId],
    );

    const view = await getInvestigationWorkspace(submission.investigationId);
    expect(view!.briefs).toHaveLength(1);
    expect(view!.briefs[0].assignedState).toBe('challenged');
  });

  it('briefs[].isSuperseded/forwardSupersededByVersionNumber are null/false for a non-superseded version and reflect the real successor for a superseded one (C2-S4)', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'text', raw: 'content' }],
    });
    const v1 = await seedBriefVersion({
      investigationId: submission.investigationId,
      sourceArtifactId: submission.sourceArtifactIds[0],
      versionNumber: 1,
    });
    const v2 = await seedBriefVersion({
      investigationId: submission.investigationId,
      sourceArtifactId: submission.sourceArtifactIds[0],
      versionNumber: 2,
      supersedesVersionId: v1,
    });

    const view = await getInvestigationWorkspace(submission.investigationId);
    expect(view!.briefs).toHaveLength(2);
    const briefV1 = view!.briefs.find((b) => b.briefVersionId === v1)!;
    const briefV2 = view!.briefs.find((b) => b.briefVersionId === v2)!;
    expect(briefV1.isSuperseded).toBe(true);
    expect(briefV1.forwardSupersededByVersionNumber).toBe(2);
    expect(briefV2.isSuperseded).toBe(false);
    expect(briefV2.forwardSupersededByVersionNumber).toBeNull();
  });
});
