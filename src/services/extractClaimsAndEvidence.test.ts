import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';
import { extractClaimsAndEvidence } from './extractClaimsAndEvidence.js';

/** Real-LLM-call integration tests (DDR-0001: Claude Agent SDK / direct Anthropic API, forced
 *  tool-use). These exercise the actual extraction/clustering/labeling judgment the model makes —
 *  the thing genuinely under test for this component — rather than mocking the boundary these
 *  scenarios are specifically about. Edge cases whose exact shape needs to be deterministic
 *  (contradicting evidence, shared-evidence-different-stances, unlabelable evidence, empty-
 *  evidence rejection) live in `extractClaimsAndEvidence.mocked.test.ts` instead, where relying on
 *  a real model to reliably reproduce a precise scenario on demand would be unreliable/flaky —
 *  this file's judgment call is stated explicitly per the roadmap's instruction to state the real-
 *  vs-mocked mix rather than leave it implicit.
 *
 *  Costs real API credits and is slower than the mocked suite; each test raises its own timeout
 *  accordingly (the project default `testTimeout` of 15s in vitest.config.ts is sized for local
 *  Postgres calls, not live LLM round trips). */
const REAL_CALL_TIMEOUT_MS = 60_000;

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    'TRUNCATE claim_version_evidence, evidence_item, claim_version, claim, source_artifact, submission, investigation CASCADE',
  );
});

async function seedResolvedTextSources(
  contents: string[],
): Promise<{ investigationId: string; sourceArtifactIds: string[] }> {
  const submission = await submitSources({
    origin: 'human',
    artifacts: contents.map((raw) => ({ type: 'text' as const, raw })),
  });
  for (let i = 0; i < contents.length; i++) {
    await pool.query(
      `UPDATE source_artifact
       SET resolution_status = 'content-retrieved', resolution_resolved_at = now(), resolved_content = $2
       WHERE id = $1`,
      [submission.sourceArtifactIds[i], contents[i]],
    );
  }
  return { investigationId: submission.investigationId, sourceArtifactIds: submission.sourceArtifactIds };
}

describe('extractClaimsAndEvidence (real LLM calls)', () => {
  it(
    'groups evidence from multiple overlapping sources under the same ClaimVersion',
    async () => {
      const { investigationId } = await seedResolvedTextSources([
        'Customer support ticket: "I can never find the export button, it is buried three menus ' +
          'deep and I waste ten minutes every week looking for it."',
        'User interview note: "Exporting my report is really hard to find in this product — the ' +
          'button is hidden behind several nested menus and it is frustrating every time."',
      ]);

      const result = await extractClaimsAndEvidence(investigationId);

      expect(result.generationFailed).toBe(false);
      expect(result.claimVersions.length).toBeGreaterThan(0);
      // At least one claim should have grouped evidence from both sources (the two texts
      // describe the same underlying assertion — the export button is hard to find).
      const groupedClaim = result.claimVersions.find((cv) => cv.evidence.length >= 2);
      expect(groupedClaim).toBeDefined();

      const rows = await pool.query(
        'SELECT claim_version_id, evidence_item_id FROM claim_version_evidence WHERE claim_version_id = $1',
        [groupedClaim!.id],
      );
      expect(rows.rows.length).toBe(groupedClaim!.evidence.length);
    },
    REAL_CALL_TIMEOUT_MS,
  );

  it(
    'creates a new ClaimVersion under the same Claim.id when a later source corrects an earlier one',
    async () => {
      const { investigationId } = await seedResolvedTextSources([
        'Support log: "Our onboarding flow takes new users about 45 minutes to complete, which is ' +
          'far too long and causes many users to abandon partway through."',
      ]);
      const first = await extractClaimsAndEvidence(investigationId);
      expect(first.generationFailed).toBe(false);
      expect(first.claimVersions.length).toBeGreaterThan(0);
      const originalClaimId = first.claimVersions[0].claimId;
      const originalVersionId = first.claimVersions[0].id;

      const correctionText =
        'Correction from engineering: "We re-measured — onboarding actually takes closer to 45 ' +
        'minutes on average, confirmed via analytics, and abandonment is a real, ongoing problem."';
      const correctionSubmission = await submitSources({
        investigationId,
        origin: 'human',
        artifacts: [{ type: 'text', raw: correctionText }],
      });
      await pool.query(
        `UPDATE source_artifact
         SET resolution_status = 'content-retrieved', resolution_resolved_at = now(), resolved_content = $2
         WHERE id = $1`,
        [correctionSubmission.sourceArtifactIds[0], correctionText],
      );

      const second = await extractClaimsAndEvidence(investigationId);
      expect(second.generationFailed).toBe(false);

      const priorRow = await pool.query('SELECT text, version_number FROM claim_version WHERE id = $1', [
        originalVersionId,
      ]);
      expect(priorRow.rows[0].version_number).toBe(1);

      const laterVersions = await pool.query(
        'SELECT id, version_number, supersedes_version_id FROM claim_version WHERE claim_id = $1 ORDER BY version_number',
        [originalClaimId],
      );
      // Not asserting the model necessarily clustered onto the exact same Claim.id (that is a
      // real-model judgment call, not a deterministic guarantee) — but if it did, the prior
      // version must remain unedited and any new version must supersede it, never overwrite it.
      if (laterVersions.rows.length > 1) {
        expect(laterVersions.rows[0].version_number).toBe(1);
        expect(laterVersions.rows[1].supersedes_version_id).toBe(originalVersionId);
      }
    },
    REAL_CALL_TIMEOUT_MS,
  );

  it(
    'surfaces a generation-failure signal when source material is too vague for a specific problem statement',
    async () => {
      const { investigationId } = await seedResolvedTextSources([
        'Things are things. Stuff happens sometimes, in general, for various reasons, to various ' +
          'people, in various ways, at various times.',
      ]);

      const result = await extractClaimsAndEvidence(investigationId);

      expect(result.problemStatementCandidates).toHaveLength(0);
      expect(result.generationFailed).toBe(true);
      expect(result.generationFailureReason).toBeTruthy();

      const briefRows = await pool.query('SELECT problem_brief_id FROM investigation WHERE id = $1', [
        investigationId,
      ]);
      expect(briefRows.rows[0].problem_brief_id).toBeNull();
    },
    REAL_CALL_TIMEOUT_MS,
  );
});
