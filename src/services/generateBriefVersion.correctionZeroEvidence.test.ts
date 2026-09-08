import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';

/**
 * C2-S3 §4.8 — the single most important QC-flagged gap: proving a correction attempt whose
 * candidate source contributes ZERO evidence is finalized `'no-new-usable-evidence'` even when
 * other/older sources in the SAME Investigation would yield evidence if whole-Investigation
 * extraction had run instead (the exact defect the C2-S3 fix — scoping correction extraction to
 * `extractClaimsAndEvidenceForSourceArtifacts` over the candidate id set, never the whole-
 * Investigation `extractClaimsAndEvidence` — exists to close).
 *
 * Only the LLM boundary (`callForcedTool`) is mocked, matching
 * `extractClaimsAndEvidence.mocked.test.ts`'s established convention — `generateBriefVersion`,
 * `extractClaimsAndEvidenceForSourceArtifacts`, and `getCandidateCorrectionSourceIds` all run for
 * real, against a real Postgres connection. The mock's own behavior is keyed on which source's
 * marker text appears in the built prompt, so it can prove, in the SAME assertion, both that (a)
 * the correction call is scoped away from the older source and (b) that older source would have
 * produced evidence had it been included — never a mock that could return an impossible/
 * unconditional result regardless of scoping.
 */

vi.mock('./llmClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./llmClient.js')>();
  return { ...actual, callForcedTool: vi.fn() };
});

const { callForcedTool } = await import('./llmClient.js');
const { generateBriefVersion, BriefGenerationFailedError } = await import('./generateBriefVersion.js');
const { getCandidateCorrectionSourceIds } = await import('./getInvestigationWorkspace.js');

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE claim_version_evidence, evidence_item, claim_version, claim,
              generation_run_consumed_source, brief_version, problem_brief,
              generation_step, generation_run,
              source_artifact, submission, investigation CASCADE`,
  );
  vi.mocked(callForcedTool).mockReset();
});

const OLD_MARKER = 'OLD_SOURCE_MARKER_CONTENT';
const NEW_MARKER = 'NEW_CANDIDATE_MARKER_CONTENT';

async function seedInvestigation(): Promise<string> {
  const submission = await submitSources({ origin: 'human', artifacts: [{ type: 'text', raw: 'seed' }] });
  return submission.investigationId;
}

async function insertSubmittedResolvedSource(investigationId: string, hash: string, content: string): Promise<string> {
  const submissionResult = await pool.query<{ id: string }>(
    `INSERT INTO submission (investigation_id, origin) VALUES ($1, 'human') RETURNING id`,
    [investigationId],
  );
  const result = await pool.query<{ id: string }>(
    `INSERT INTO source_artifact
       (investigation_id, submission_id, type, raw, origin, resolution_status, resolution_resolved_at,
        resolved_content, resolved_content_hash)
     VALUES ($1, $2, 'url', $3, 'submitted', 'content-retrieved', now(), $3, $4)
     RETURNING id`,
    [investigationId, submissionResult.rows[0].id, content, hash],
  );
  return result.rows[0].id;
}

async function insertGenerationRun(investigationId: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO generation_run (investigation_id, outcome, started_at, completed_at, runtime_identifier)
     VALUES ($1, 'succeeded', now(), now(), 'test-runtime')
     RETURNING id`,
    [investigationId],
  );
  return result.rows[0].id;
}

async function insertProblemBrief(investigationId: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO problem_brief (investigation_id, current_version_id) VALUES ($1, NULL) RETURNING id`,
    [investigationId],
  );
  return result.rows[0].id;
}

async function insertBriefVersion(problemBriefId: string, generationRunId: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO brief_version
       (problem_brief_id, generation_run_id, version_number, supersedes_version_id,
        problem_statement_ids, claim_version_ids, demand_confidence_classification,
        uncertainty_statement, recommendation)
     VALUES ($1, $2, 1, NULL, $3, $4, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)
     RETURNING id`,
    [problemBriefId, generationRunId, [randomUUID()], [randomUUID()]],
  );
  return result.rows[0].id;
}

async function pointBriefAtVersion(problemBriefId: string, briefVersionId: string): Promise<void> {
  await pool.query(`UPDATE problem_brief SET current_version_id = $2 WHERE id = $1`, [problemBriefId, briefVersionId]);
}

async function ledgerConsumedSource(generationRunId: string, sourceArtifactId: string): Promise<void> {
  await pool.query(
    `INSERT INTO generation_run_consumed_source
       (generation_run_id, source_artifact_id, correction_target_brief_version_id)
     VALUES ($1, $2, NULL)`,
    [generationRunId, sourceArtifactId],
  );
}

/** Keyed on which marker string appears in the built prompt — proves the correction call really
 * is scoped to only the candidate source, and that the excluded older source WOULD have yielded
 * evidence had whole-Investigation extraction run instead. */
function installScopeSensitiveLlmMock() {
  vi.mocked(callForcedTool).mockImplementation(async (args: { userPrompt: string }) => {
    if (args.userPrompt.includes(OLD_MARKER)) {
      return {
        attempts: 1,
        value: {
          evidenceItems: [{ sourceArtifactId: 'irrelevant', excerptOrSummary: 'old evidence', label: 'observation' }],
          claims: [{ text: 'A claim from the old source', evidenceRefs: [{ evidenceIndex: 0, stance: 'supporting' }] }],
          problemStatements: [
            {
              whoExperiencesIt: 'someone',
              contextOrWorkflow: 'somewhere',
              consequenceOrFriction: 'something',
              supportingClaimIndices: [0],
            },
          ],
        },
      };
    }
    return { attempts: 1, value: { evidenceItems: [], claims: [], problemStatements: [] } };
  });
}

describe('generateBriefVersion — correction zero-evidence disposition (§4.8, real extraction)', () => {
  it(
    "finalizes 'no-new-usable-evidence' for a correction whose candidate source yields zero " +
      'evidence, even though the Investigation\'s older, already-consumed source would have ' +
      'yielded evidence had whole-Investigation extraction run instead',
    async () => {
      const investigationId = await seedInvestigation();
      await pool.query(`UPDATE investigation SET status = 'brief-generated' WHERE id = $1`, [investigationId]);

      const oldSourceId = await insertSubmittedResolvedSource(investigationId, 'hash-old', OLD_MARKER);
      const run1 = await insertGenerationRun(investigationId);
      const problemBriefId = await insertProblemBrief(investigationId);
      const v1 = await insertBriefVersion(problemBriefId, run1);
      await pointBriefAtVersion(problemBriefId, v1);
      await ledgerConsumedSource(run1, oldSourceId);

      const candidateSourceId = await insertSubmittedResolvedSource(investigationId, 'hash-new', NEW_MARKER);

      // Sanity: the real eligibility mechanism resolves exactly the new source as the candidate —
      // the old, already-ledgered source is correctly excluded up front.
      expect(await getCandidateCorrectionSourceIds(investigationId)).toEqual([candidateSourceId]);

      installScopeSensitiveLlmMock();

      let thrown: unknown;
      try {
        await generateBriefVersion({ investigationId, supersedesVersionId: v1, runtimeIdentifier: 'test-runtime' });
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(BriefGenerationFailedError);
      expect((thrown as InstanceType<typeof BriefGenerationFailedError>).reason).toBe('no-new-usable-evidence');

      // The LLM was invoked exactly once (this run's own scoped extraction call) and its prompt
      // never mentioned the old source — proving the call was genuinely scoped to the candidate
      // only, not the whole Investigation.
      expect(callForcedTool).toHaveBeenCalledTimes(1);
      const promptSeen = vi.mocked(callForcedTool).mock.calls[0][0] as { userPrompt: string };
      expect(promptSeen.userPrompt).toContain(NEW_MARKER);
      expect(promptSeen.userPrompt).not.toContain(OLD_MARKER);

      // Real persisted disposition: TWO failed steps, both correctly 'failed' — `runStepWithProvenance`
      // records the "Extraction & Clustering Engine" step itself as failed (a `completed-zero-evidence`
      // outcome structurally implies `generationFailed: true`, per extractClaimsAndEvidence.ts's own
      // fail-closed rules), and the §4.8 correction-specific disposition then separately records its
      // own named 'Extraction: correction evidence validation' failed step with the specific
      // 'no-new-usable-evidence' reason — run finalized failed, no new BriefVersion, current
      // pointer/status untouched.
      const stepRows = await pool.query<{ outcome: string; error: string | null; component: string }>(
        `SELECT gs.outcome, error, component FROM generation_step gs
           JOIN generation_run gr ON gr.id = gs.generation_run_id
          WHERE gr.investigation_id = $1 AND gr.id != $2
          ORDER BY gs.step_index`,
        [investigationId, run1],
      );
      expect(stepRows.rows).toHaveLength(2);
      expect(stepRows.rows[0].outcome).toBe('failed');
      expect(stepRows.rows[0].component).toBe('Extraction & Clustering Engine');
      expect(stepRows.rows[1].outcome).toBe('failed');
      expect(stepRows.rows[1].error).toBe('no-new-usable-evidence');
      expect(stepRows.rows[1].component).toBe('Extraction: correction evidence validation');

      const runRow = await pool.query<{ outcome: string }>(
        `SELECT outcome FROM generation_run WHERE investigation_id = $1 AND id != $2`,
        [investigationId, run1],
      );
      expect(runRow.rows).toHaveLength(1);
      expect(runRow.rows[0].outcome).toBe('failed');

      const briefRow = await pool.query<{ current_version_id: string }>(
        `SELECT current_version_id FROM problem_brief WHERE investigation_id = $1`,
        [investigationId],
      );
      expect(briefRow.rows[0].current_version_id).toBe(v1);

      const versionCount = await pool.query<{ count: string }>(
        `SELECT count(*) FROM brief_version WHERE problem_brief_id = $1`,
        [problemBriefId],
      );
      expect(versionCount.rows[0].count).toBe('1');

      const investigationRow = await pool.query<{ status: string }>(
        `SELECT status FROM investigation WHERE id = $1`,
        [investigationId],
      );
      expect(investigationRow.rows[0].status).toBe('brief-generated');

      // The failed candidate is ledgered against this run (extractionInputSourceIds), targeting
      // v1 — and remains ineligible for a resubmit of the exact same hash.
      const ledgerRows = await pool.query<{ source_artifact_id: string; correction_target_brief_version_id: string }>(
        `SELECT source_artifact_id, correction_target_brief_version_id
           FROM generation_run_consumed_source
          WHERE generation_run_id != $1`,
        [run1],
      );
      expect(ledgerRows.rows).toHaveLength(1);
      expect(ledgerRows.rows[0].source_artifact_id).toBe(candidateSourceId);
      expect(ledgerRows.rows[0].correction_target_brief_version_id).toBe(v1);

      expect(await getCandidateCorrectionSourceIds(investigationId)).toEqual([]);

      // Another distinct snapshot (a new, different-hash source) re-enables an attempt — the
      // zero-evidence disposition ineligibility is scoped to the exhausted candidate's own hash,
      // not a blanket lock on the Investigation.
      const anotherCandidateId = await insertSubmittedResolvedSource(
        investigationId,
        'hash-another-distinct',
        'ANOTHER_DISTINCT_MARKER_CONTENT',
      );
      expect(await getCandidateCorrectionSourceIds(investigationId)).toEqual([anotherCandidateId]);
    },
  );
});
