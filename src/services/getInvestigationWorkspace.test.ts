import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
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
    `TRUNCATE web_search_result, query_limitation, web_search_query, generation_step,
              generation_run, source_artifact, submission, investigation
     CASCADE`,
  );
});

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
});
