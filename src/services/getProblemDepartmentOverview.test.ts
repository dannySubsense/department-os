import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import { pool } from '../db/pool.js';
import { getProblemDepartmentOverview } from './getProblemDepartmentOverview.js';
import { DEPARTMENTS } from '../config/departments.js';

// Integration coverage for getProblemDepartmentOverview (04-ROADMAP.md Slice 2 Tests list) — run
// against the real dev Postgres (DDR-0001), no mocking of the database.

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

describe('getProblemDepartmentOverview', () => {
  it('returns the fully honest empty shape when zero Investigations exist (Edge Cases table row 6)', async () => {
    const view = await getProblemDepartmentOverview();
    expect(view.department.id).toBe(problemDepartmentConfig.id);
    expect(view.department.name).toBe(problemDepartmentConfig.name);
    expect(view.department.thesis).toBe(problemDepartmentConfig.thesis);
    expect(view.investigations).toEqual([]);
    expect(view.lastActiveInvestigationId).toBeNull();
    expect(view.sourceCount).toBe(0);
    expect(view.evidenceCount).toBe(0);
    expect(view.recentRuns).toEqual([]);
  });

  it('every field matches real persisted rows across a mixed dataset', async () => {
    // investigationB is created FIRST and gets no further activity, so its last_activity_at is
    // pinned to its own (earlier) created_at. investigationA is created SECOND, and its
    // GenerationRun is started with a real current timestamp (`new Date()`), so
    // GREATEST(investigationA.created_at, generation_run.started_at) is chronologically after
    // investigationB's last activity regardless of real wall-clock test-run time — unlike a
    // hardcoded past date, which cannot reliably postdate a `now()`-based creation timestamp.
    const investigationB = await insertInvestigation('blocked', 'No source reachable.');

    const investigationA = await insertInvestigation('open');
    await insertGenerationRun(investigationA, 'in-progress', new Date(), null);
    const sourceArtifactA = await insertSourceArtifact(investigationA);
    await insertEvidenceItem(sourceArtifactA);

    const view = await getProblemDepartmentOverview();

    const ids = view.investigations.map((i) => i.id).sort();
    expect(ids).toEqual([investigationA, investigationB].sort());

    const rowA = view.investigations.find((i) => i.id === investigationA)!;
    expect(rowA.status).toBe('open');
    expect(rowA.statusReason).toBeUndefined();

    const rowB = view.investigations.find((i) => i.id === investigationB)!;
    expect(rowB.status).toBe('blocked');
    expect(rowB.statusReason).toBe('No source reachable.');

    // lastActiveInvestigationId is investigationA — it has the most recent activity (its
    // GenerationRun started at real current time, after investigationB's creation).
    expect(view.lastActiveInvestigationId).toBe(investigationA);

    expect(view.sourceCount).toBe(1);
    expect(view.evidenceCount).toBe(1);
    expect(view.recentRuns.length).toBe(1);
    expect(view.recentRuns[0].investigationId).toBe(investigationA);
  });
});
