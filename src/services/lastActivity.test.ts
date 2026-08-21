import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import { pool } from '../db/pool.js';
import { LAST_ACTIVITY_SUBQUERY } from './lastActivity.js';

// Integration coverage for LAST_ACTIVITY_SUBQUERY's fallback-to-created_at behavior (Edge Cases
// table row 3) — 04-ROADMAP.md Slice 1 Tests list.

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

describe('LAST_ACTIVITY_SUBQUERY', () => {
  it('resolves last_activity_at to investigation.created_at when no GenerationRun/GenerationStep/BriefVersion rows exist', async () => {
    const inserted = await pool.query<{ id: string; created_at: Date }>(
      `INSERT INTO investigation (status) VALUES ('open') RETURNING id, created_at`,
    );
    const { id, created_at: createdAt } = inserted.rows[0];

    const result = await pool.query<{ investigation_id: string; last_activity_at: Date }>(
      `SELECT * FROM (${LAST_ACTIVITY_SUBQUERY}) la WHERE la.investigation_id = $1`,
      [id],
    );

    expect(result.rowCount).toBe(1);
    expect(result.rows[0].last_activity_at.toISOString()).toBe(createdAt.toISOString());
  });
});
