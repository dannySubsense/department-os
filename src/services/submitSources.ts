import { pool } from '../db/pool.js';
import type { Submission, SubmissionOrigin, SourceArtifactType } from '../types/domain.js';

export interface SubmitSourcesInput {
  investigationId?: string; // omit to start a new Investigation
  origin: SubmissionOrigin;
  artifacts: Array<{ type: SourceArtifactType; raw: string }>;
}

/** Intake Service — Architecture §4.
 *  Rejects (throws) if artifacts.length === 0 — US-1 AC3.
 *  Every SourceArtifact created here is persisted with origin: 'submitted' (Q-6/Decision 1.5).
 *  When investigationId is omitted, creates a new Investigation (status 'open') first.
 *  When investigationId is provided, adds this Submission's artifacts to the existing
 *  Investigation. */
export async function submitSources(input: SubmitSourcesInput): Promise<Submission> {
  if (input.artifacts.length === 0) {
    throw new Error('submitSources: at least one artifact is required (US-1 AC3)');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let investigationId = input.investigationId;
    if (!investigationId) {
      const investigationResult = await client.query<{ id: string }>(
        `INSERT INTO investigation (status) VALUES ('open') RETURNING id`,
      );
      investigationId = investigationResult.rows[0].id;
    } else {
      const existing = await client.query('SELECT id FROM investigation WHERE id = $1', [
        investigationId,
      ]);
      if (existing.rowCount === 0) {
        throw new Error(`submitSources: investigationId ${investigationId} does not exist`);
      }
    }

    const submissionResult = await client.query<{
      id: string;
      investigation_id: string;
      origin: string;
      submitted_at: Date;
    }>(
      `INSERT INTO submission (investigation_id, origin) VALUES ($1, $2)
       RETURNING id, investigation_id, origin, submitted_at`,
      [investigationId, input.origin],
    );
    const submissionRow = submissionResult.rows[0];

    // Single batched multi-row INSERT rather than one INSERT per artifact: this keeps the
    // number of statements — and therefore the number of separate lock-acquisition round
    // trips this transaction makes against investigation/submission/source_artifact — fixed
    // regardless of artifacts.length. A per-artifact loop holds the transaction's locks open
    // across N round trips, widening the window in which a concurrent statement requiring an
    // exclusive table-level lock (e.g. a test suite's `TRUNCATE ... CASCADE`) can queue behind
    // an already-granted lock and then block this transaction's next statement in turn,
    // producing a genuine deadlock cycle (verified via stress test — see submitSources).
    const values: unknown[] = [];
    const placeholders: string[] = [];
    input.artifacts.forEach((artifact, i) => {
      const base = i * 4;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, 'submitted')`,
      );
      values.push(investigationId, submissionRow.id, artifact.type, artifact.raw);
    });

    const artifactsResult = await client.query<{ id: string }>(
      `INSERT INTO source_artifact (investigation_id, submission_id, type, raw, origin)
       VALUES ${placeholders.join(', ')}
       RETURNING id`,
      values,
    );
    const sourceArtifactIds = artifactsResult.rows.map((row) => row.id);

    await client.query('COMMIT');

    return {
      id: submissionRow.id,
      investigationId: submissionRow.investigation_id,
      origin: submissionRow.origin,
      // pg returns timestamptz columns as JS Date objects by default; Architecture §3 contracts
      // Submission.submittedAt as an ISO-8601 string — convert at the service boundary.
      submittedAt: submissionRow.submitted_at.toISOString(),
      sourceArtifactIds,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
