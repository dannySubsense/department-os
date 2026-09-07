import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';
import { resolveSourceArtifact } from './resolveSourceArtifact.js';
import { getInvestigation } from './getInvestigation.js';

beforeEach(async () => {
  await pool.query('TRUNCATE source_artifact, submission, investigation CASCADE');
});

afterAll(async () => {
  await pool.end();
});

describe('getInvestigation', () => {
  it('returns the investigation and its sourceArtifacts with resolution status for the open branch', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'text', raw: 'pasted note' }],
    });

    const { investigation, sourceArtifacts } = await getInvestigation(submission.investigationId);

    expect(investigation.id).toBe(submission.investigationId);
    expect(investigation.status).toBe('open');
    expect(sourceArtifacts).toHaveLength(1);
    expect(sourceArtifacts[0].raw).toBe('pasted note');
    // Never resolved yet — genuine DB default, not a hardcoded value.
    expect(sourceArtifacts[0].resolution.status).toBe('unresolved');
  });

  it('reflects a resolved source\'s live resolution status, not a stale/default value', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'text', raw: 'content' }],
    });
    await resolveSourceArtifact(submission.sourceArtifactIds[0]);

    const { sourceArtifacts } = await getInvestigation(submission.investigationId);
    expect(sourceArtifacts[0].resolution.status).toBe('content-retrieved');
  });

  it('returns the correct status branch for a blocked investigation', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'url', raw: 'http://this-host-does-not-exist.invalid/dead' }],
    });
    await pool.query(`UPDATE investigation SET status = 'blocked', status_reason = $2 WHERE id = $1`, [
      submission.investigationId,
      'No submitted source was reachable.',
    ]);

    const { investigation } = await getInvestigation(submission.investigationId);
    expect(investigation.status).toBe('blocked');
    expect(investigation.statusReason).toBe('No submitted source was reachable.');
  });

  it('throws for a nonexistent investigation id', async () => {
    await expect(
      getInvestigation('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow('does not exist');
  });
});
