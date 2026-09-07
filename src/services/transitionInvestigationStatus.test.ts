import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import { pool } from '../db/pool.js';
import { transitionInvestigationStatus } from './transitionInvestigationStatus.js';

// Sol review item 3 regression coverage — both status transitions are guarded by an explicit
// allowed-prior-states map, replacing the previously-unguarded raw SQL UPDATE in server.ts.

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query('TRUNCATE source_artifact, submission, investigation CASCADE');
});

async function insertInvestigation(status: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO investigation (status) VALUES ($1) RETURNING id`,
    [status],
  );
  return result.rows[0].id;
}

describe('transitionInvestigationStatus', () => {
  it('transitions open -> blocked', async () => {
    const id = await insertInvestigation('open');
    const changed = await transitionInvestigationStatus(id, 'blocked', 'No source reachable.');
    expect(changed).toBe(true);

    const row = await pool.query('SELECT status, status_reason FROM investigation WHERE id = $1', [
      id,
    ]);
    expect(row.rows[0].status).toBe('blocked');
    expect(row.rows[0].status_reason).toBe('No source reachable.');
  });

  it('does NOT overwrite a generation-failed Investigation back to blocked', async () => {
    const id = await insertInvestigation('generation-failed');
    const changed = await transitionInvestigationStatus(id, 'blocked', 'No source reachable.');
    expect(changed).toBe(false);

    const row = await pool.query('SELECT status FROM investigation WHERE id = $1', [id]);
    expect(row.rows[0].status).toBe('generation-failed');
  });

  it('does NOT overwrite a brief-generated Investigation back to blocked', async () => {
    const id = await insertInvestigation('brief-generated');
    const changed = await transitionInvestigationStatus(id, 'blocked', 'No source reachable.');
    expect(changed).toBe(false);

    const row = await pool.query('SELECT status FROM investigation WHERE id = $1', [id]);
    expect(row.rows[0].status).toBe('brief-generated');
  });

  it('transitions blocked -> open (recovery), a regression check for pre-existing behavior', async () => {
    const id = await insertInvestigation('blocked');
    const changed = await transitionInvestigationStatus(id, 'open', null);
    expect(changed).toBe(true);

    const row = await pool.query('SELECT status, status_reason FROM investigation WHERE id = $1', [
      id,
    ]);
    expect(row.rows[0].status).toBe('open');
    expect(row.rows[0].status_reason).toBeNull();
  });

  it('does NOT transition an already-open Investigation to open (no-op, not eligible)', async () => {
    const id = await insertInvestigation('open');
    const changed = await transitionInvestigationStatus(id, 'open', null);
    expect(changed).toBe(false);
  });
});
