import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import { pool } from '../db/pool.js';
import { getMissionControlView } from './getMissionControlView.js';
import { DEPARTMENTS } from '../config/departments.js';

// Integration coverage for getMissionControlView's 9 independent queries (Architecture §5.3,
// POST-CORRECTION §0a), run against the real dev Postgres (DDR-0001) — 04-ROADMAP.md Slice 1
// Tests list.

const problemDepartmentConfig = DEPARTMENTS.find((d) => d.id === 'problem-department')!;

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE evidence_item, source_artifact, submission, brief_version, problem_brief,
              generation_step, generation_run, investigation
     CASCADE`,
  );
});

async function insertInvestigation(
  status: string,
  statusReason: string | null = null,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO investigation (status, status_reason) VALUES ($1, $2) RETURNING id`,
    [status, statusReason],
  );
  return result.rows[0].id;
}

async function insertGenerationRun(
  investigationId: string,
  outcome: 'in-progress' | 'succeeded' | 'failed',
  startedAt: Date,
  completedAt: Date | null,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO generation_run (investigation_id, outcome, started_at, completed_at, runtime_identifier)
     VALUES ($1, $2, $3, $4, 'test-runtime')
     RETURNING id`,
    [investigationId, outcome, startedAt, completedAt],
  );
  return result.rows[0].id;
}

async function insertSourceArtifact(investigationId: string): Promise<string> {
  const submission = await pool.query<{ id: string }>(
    `INSERT INTO submission (investigation_id, origin) VALUES ($1, 'human') RETURNING id`,
    [investigationId],
  );
  const artifact = await pool.query<{ id: string }>(
    `INSERT INTO source_artifact (investigation_id, submission_id, type, raw, origin)
     VALUES ($1, $2, 'url', 'https://example.com', 'submitted') RETURNING id`,
    [investigationId, submission.rows[0].id],
  );
  return artifact.rows[0].id;
}

async function insertEvidenceItem(sourceArtifactId: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO evidence_item (source_artifact_id, excerpt_or_summary, label)
     VALUES ($1, 'a test excerpt', 'fact') RETURNING id`,
    [sourceArtifactId],
  );
  return result.rows[0].id;
}

async function insertBriefVersion(
  investigationId: string,
  generationRunId: string,
): Promise<string> {
  const problemBrief = await pool.query<{ id: string }>(
    `INSERT INTO problem_brief (investigation_id) VALUES ($1) RETURNING id`,
    [investigationId],
  );
  const fakeStatementId = '00000000-0000-0000-0000-000000000001';
  const fakeClaimVersionId = '00000000-0000-0000-0000-000000000002';
  const briefVersion = await pool.query<{ id: string }>(
    `INSERT INTO brief_version
       (problem_brief_id, version_number, generation_run_id, problem_statement_ids,
        claim_version_ids, demand_confidence_classification, uncertainty_statement, recommendation)
     VALUES ($1, 1, $2, $3, $4, '{}'::jsonb, '{}'::jsonb, '{"decision": "pursue"}'::jsonb)
     RETURNING id`,
    [problemBrief.rows[0].id, generationRunId, [fakeStatementId], [fakeClaimVersionId]],
  );
  return briefVersion.rows[0].id;
}

describe('getMissionControlView', () => {
  it('returns the fully honest empty shape when zero Investigations exist (Edge Cases table row 6)', async () => {
    const view = await getMissionControlView();
    expect(view.problemDepartment).toEqual({
      id: problemDepartmentConfig.id,
      name: problemDepartmentConfig.name,
      thesis: problemDepartmentConfig.thesis,
      investigationCount: 0,
      activeCount: 0,
      needsAttentionCount: 0,
      recentCompletedCount: 0,
    });
    expect(view.activeWork.active).toEqual([]);
    expect(view.activeWork.readyNotStarted).toEqual([]);
    expect(view.activeWork.needsAttention).toEqual([]);
    expect(view.activeWork.recentCompleted).toEqual([]);
    expect(view.activeActivity).toEqual([]);
    expect(view.recent.investigations).toEqual([]);
    expect(view.recent.briefs).toEqual([]);
    expect(view.recent.evidence).toEqual([]);
  });

  it('has no `departments` field on the response (Danny\'s ruling — DepartmentsStrip data removed)', async () => {
    const view = await getMissionControlView();
    expect(view).not.toHaveProperty('departments');
  });

  it('problemDepartment.name/thesis/id match departmentRegistry verbatim', async () => {
    const view = await getMissionControlView();
    expect(view.problemDepartment.id).toBe(problemDepartmentConfig.id);
    expect(view.problemDepartment.name).toBe(problemDepartmentConfig.name);
    expect(view.problemDepartment.thesis).toBe(problemDepartmentConfig.thesis);
  });

  it('every one of the 9 queries matches real persisted rows across a mixed-status dataset', async () => {
    // A: status='open' + in-progress run -> activeWork.active, activeActivity
    const investigationA = await insertInvestigation('open');
    const runA = await insertGenerationRun(
      investigationA,
      'in-progress',
      new Date('2026-01-01T00:00:00Z'),
      null,
    );
    const sourceArtifactA = await insertSourceArtifact(investigationA);
    const evidenceA = await insertEvidenceItem(sourceArtifactA);

    // B: status='open' + zero runs -> activeWork.readyNotStarted
    const investigationB = await insertInvestigation('open');

    // C: status='blocked' + zero runs -> activeWork.needsAttention
    const investigationC = await insertInvestigation('blocked', 'No source reachable.');

    // D: status='brief-generated' + succeeded run + real BriefVersion -> activeWork.recentCompleted,
    // recent.briefs
    const investigationD = await insertInvestigation('brief-generated');
    const runD = await insertGenerationRun(
      investigationD,
      'succeeded',
      new Date('2026-01-02T00:00:00Z'),
      new Date('2026-01-02T01:00:00Z'),
    );
    const briefVersionD = await insertBriefVersion(investigationD, runD);

    const view = await getMissionControlView();

    expect(view).not.toHaveProperty('departments');

    expect(view.activeWork.active.map((i) => i.id)).toEqual([investigationA]);
    expect(view.activeWork.readyNotStarted.map((i) => i.id)).toEqual([investigationB]);
    expect(view.activeWork.needsAttention.map((i) => i.id)).toEqual([investigationC]);
    expect(view.activeWork.recentCompleted.map((i) => i.id)).toEqual([investigationD]);

    expect(view.activeActivity.map((r) => r.generationRunId)).toEqual([runA]);

    const recentIds = view.recent.investigations.map((i) => i.id).sort();
    expect(recentIds).toEqual([investigationA, investigationB, investigationC, investigationD].sort());

    expect(view.recent.briefs.map((b) => b.briefVersionId)).toEqual([briefVersionD]);
    expect(view.recent.evidence.map((e) => e.evidenceItemId)).toEqual([evidenceA]);

    // problemDepartment.investigationCount === real COUNT(*)
    expect(view.problemDepartment.investigationCount).toBe(4);
    // active/needsAttention/recentCompleted counts match the corresponding array's .length
    expect(view.problemDepartment.activeCount).toBe(view.activeWork.active.length);
    expect(view.problemDepartment.needsAttentionCount).toBe(view.activeWork.needsAttention.length);
    expect(view.problemDepartment.recentCompletedCount).toBe(
      view.activeWork.recentCompleted.length,
    );
    expect(view.problemDepartment.activeCount).toBe(1);
    expect(view.problemDepartment.needsAttentionCount).toBe(1);
    expect(view.problemDepartment.recentCompletedCount).toBe(1);
  });

  it('a status=open Investigation with zero GenerationRun rows appears ONLY in readyNotStarted (US-6, Edge Cases row 5)', async () => {
    const investigationId = await insertInvestigation('open');

    const view = await getMissionControlView();

    expect(view.activeWork.readyNotStarted.map((i) => i.id)).toContain(investigationId);
    expect(view.activeWork.active.map((i) => i.id)).not.toContain(investigationId);
    expect(view.activeWork.needsAttention.map((i) => i.id)).not.toContain(investigationId);
    expect(view.activeWork.recentCompleted.map((i) => i.id)).not.toContain(investigationId);
  });

  it('an Investigation with an in-progress GenerationRun appears ONLY in active (US-6 AC1)', async () => {
    const investigationId = await insertInvestigation('open');
    await insertGenerationRun(investigationId, 'in-progress', new Date(), null);

    const view = await getMissionControlView();

    expect(view.activeWork.active.map((i) => i.id)).toContain(investigationId);
    expect(view.activeWork.readyNotStarted.map((i) => i.id)).not.toContain(investigationId);
    expect(view.activeWork.needsAttention.map((i) => i.id)).not.toContain(investigationId);
    expect(view.activeWork.recentCompleted.map((i) => i.id)).not.toContain(investigationId);
  });

  it("a generation-failed Investigation with a GenerationRun outcome='failed' appears ONLY in needsAttention, never recentCompleted (§5.3 query 5 correction)", async () => {
    const investigationId = await insertInvestigation(
      'generation-failed',
      'No valid Problem Statement could be established.',
    );
    await insertGenerationRun(
      investigationId,
      'failed',
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-01T01:00:00Z'),
    );

    const view = await getMissionControlView();

    expect(view.activeWork.needsAttention.map((i) => i.id)).toContain(investigationId);
    expect(view.activeWork.active.map((i) => i.id)).not.toContain(investigationId);
    expect(view.activeWork.readyNotStarted.map((i) => i.id)).not.toContain(investigationId);
    expect(view.activeWork.recentCompleted.map((i) => i.id)).not.toContain(investigationId);
  });
});
