import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';

// Smoke coverage only, per this slice's contract — @test-writer owns the full test pass.
// Runs against the real dev Postgres (DDR-0001) started via docker-compose.yml; requires the
// schema to already be migrated (`npm run migrate`).

beforeEach(async () => {
  await pool.query('TRUNCATE source_artifact, submission, investigation CASCADE');
});

afterAll(async () => {
  await pool.end();
});

describe('submitSources', () => {
  it('creates one Investigation + SourceArtifact records, each origin: submitted', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [
        { type: 'url', raw: 'https://example.com' },
        { type: 'text', raw: 'pasted note' },
      ],
    });

    expect(submission.sourceArtifactIds).toHaveLength(2);

    const investigations = await pool.query('SELECT * FROM investigation');
    expect(investigations.rowCount).toBe(1);
    expect(investigations.rows[0].id).toBe(submission.investigationId);

    const artifacts = await pool.query('SELECT origin FROM source_artifact');
    expect(artifacts.rowCount).toBe(2);
    for (const row of artifacts.rows) {
      expect(row.origin).toBe('submitted');
    }
  });

  it('rejects zero artifacts and creates no Investigation', async () => {
    await expect(submitSources({ origin: 'human', artifacts: [] })).rejects.toThrow(
      'submitSources: at least one artifact is required (US-1 AC3)',
    );

    const investigations = await pool.query('SELECT * FROM investigation');
    expect(investigations.rowCount).toBe(0);
  });

  it('accepts an arbitrary future origin string without rejecting (open discriminator)', async () => {
    const submission = await submitSources({
      origin: 'future-collector-channel',
      artifacts: [{ type: 'url', raw: 'https://example.com' }],
    });
    expect(submission.origin).toBe('future-collector-channel');
  });

  it('submittedAt is returned as an ISO-8601 string, not a JS Date (Architecture §3)', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'url', raw: 'https://example.com' }],
    });
    expect(typeof submission.submittedAt).toBe('string');
    expect(new Date(submission.submittedAt).toISOString()).toBe(submission.submittedAt);
  });

  it("persists a SourceArtifact with origin 'landscape-research' and no submission_id (Decision 1.5/Q-6)", async () => {
    // No service exists for the Landscape Researcher's own writes yet (Slice 3) — this exercises
    // the schema directly, which is what the durable contract (schema.sql) must support now per
    // 04-ROADMAP.md, independent of which slice builds the writer.
    const investigation = await pool.query<{ id: string }>(
      `INSERT INTO investigation (status) VALUES ('open') RETURNING id`,
    );
    const investigationId = investigation.rows[0].id;

    const result = await pool.query(
      `INSERT INTO source_artifact (investigation_id, submission_id, type, raw, origin)
       VALUES ($1, NULL, 'url', 'https://example.com/found-by-research', 'landscape-research')
       RETURNING id, submission_id, origin`,
      [investigationId],
    );

    expect(result.rowCount).toBe(1);
    expect(result.rows[0].submission_id).toBeNull();
    expect(result.rows[0].origin).toBe('landscape-research');
  });

  it("adds to an existing Investigation when investigationId is provided", async () => {
    const first = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'url', raw: 'https://example.com/1' }],
    });

    const second = await submitSources({
      investigationId: first.investigationId,
      origin: 'human',
      artifacts: [{ type: 'url', raw: 'https://example.com/2' }],
    });

    expect(second.investigationId).toBe(first.investigationId);

    const investigations = await pool.query('SELECT * FROM investigation');
    expect(investigations.rowCount).toBe(1);
  });
});
