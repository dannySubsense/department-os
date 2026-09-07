import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';

/** Mocked-LLM tests for `analyzeDemand` — same rationale as
 *  `extractClaimsAndEvidence.mocked.test.ts`: the invariants under test (fail-closed per-signal
 *  filtering, `negativeFindingSignal` trigger semantics, Personal-Pull quarantine) are
 *  deterministic properties of the filtering/mapping logic, not of a real model's judgment, so
 *  mocking `callForcedTool` at the same boundary keeps the thing genuinely under test isolated
 *  from model non-determinism. */
vi.mock('./llmClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./llmClient.js')>();
  return {
    ...actual,
    callForcedTool: vi.fn(),
  };
});

const { callForcedTool } = await import('./llmClient.js');
const { analyzeDemand } = await import('./demandAnalyzer.js');

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    'TRUNCATE claim_version_evidence, evidence_item, claim_version, claim, source_artifact, submission, investigation CASCADE',
  );
  vi.mocked(callForcedTool).mockReset();
});

/** Seeds an Investigation with one source and N EvidenceItem rows directly (bypassing Slice 4's
 *  extraction pipeline, which is out of scope here — this slice only needs EvidenceItem rows to
 *  already exist, matching how `extractClaimsAndEvidence.mocked.test.ts` seeds already-resolved
 *  sources rather than re-exercising the resolver). */
async function seedInvestigationWithEvidence(
  excerpts: string[],
): Promise<{ investigationId: string; sourceArtifactId: string; evidenceItemIds: string[] }> {
  const submission = await submitSources({
    origin: 'human',
    artifacts: [{ type: 'text', raw: excerpts.join('\n') }],
  });
  const sourceArtifactId = submission.sourceArtifactIds[0];
  const evidenceItemIds: string[] = [];
  for (const excerpt of excerpts) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO evidence_item (source_artifact_id, excerpt_or_summary, label)
       VALUES ($1, $2, 'observation') RETURNING id`,
      [sourceArtifactId, excerpt],
    );
    evidenceItemIds.push(result.rows[0].id);
  }
  return { investigationId: submission.investigationId, sourceArtifactId, evidenceItemIds };
}

describe('analyzeDemand', () => {
  it('produces DemandSignalCandidates with types drawn from the named list, or other-observed-behavior + otherTypeLabel', async () => {
    const { investigationId } = await seedInvestigationWithEvidence([
      'Three customers said they currently pay a contractor to do this manually.',
      'One customer described a bespoke, unusual workaround involving spreadsheets and a cron job.',
    ]);

    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        demandSignals: [
          { type: 'paid-labor', evidenceIndices: [0] },
          { type: 'other-observed-behavior', otherTypeLabel: 'cron-job-workaround', evidenceIndices: [1] },
        ],
        confidenceClassification: {
          level: 'Emerging',
          narrative: 'Paid labor and an unusual custom workaround both indicate emerging demand.',
          citedSignalIndices: [0, 1],
        },
      },
    });

    const result = await analyzeDemand(investigationId);

    expect(result.generationFailed).toBe(false);
    expect(result.demandSignalCandidates).toHaveLength(2);
    expect(result.demandSignalCandidates[0].type).toBe('paid-labor');
    expect(result.demandSignalCandidates[0].otherTypeLabel).toBeUndefined();
    expect(result.demandSignalCandidates[1].type).toBe('other-observed-behavior');
    expect(result.demandSignalCandidates[1].otherTypeLabel).toBe('cron-job-workaround');
  });

  it('produces exactly one DemandConfidenceClassificationCandidate with level in the 3-value union and a narrative citing signals/gaps', async () => {
    const { investigationId } = await seedInvestigationWithEvidence([
      'Several customers filed a formal RFP asking for exactly this capability.',
    ]);

    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        demandSignals: [{ type: 'rfps', evidenceIndices: [0] }],
        confidenceClassification: {
          level: 'Substantiated',
          narrative: 'A formal RFP (signal 0) is strong, direct evidence of demand.',
          citedSignalIndices: [0],
        },
      },
    });

    const result = await analyzeDemand(investigationId);

    expect(['Insufficient', 'Emerging', 'Substantiated']).toContain(
      result.demandConfidenceClassificationCandidate.level,
    );
    expect(result.demandConfidenceClassificationCandidate.level).toBe('Substantiated');
    expect(result.demandConfidenceClassificationCandidate.narrative).toMatch(/RFP/i);
    expect(result.demandConfidenceClassificationCandidate.citedDemandSignalIds).toHaveLength(1);
    expect(result.demandConfidenceClassificationCandidate.citedDemandSignalIds[0]).toBe(
      result.demandSignalCandidates[0].localId,
    );
  });

  it('given Personal-Pull-only source material, produces zero DemandSignalCandidates, Insufficient level, empty citedDemandSignalIds, and a triggered negativeFindingSignal', async () => {
    const { investigationId } = await seedInvestigationWithEvidence([
      'The founder said they have always personally dreamed of building this product.',
    ]);

    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        demandSignals: [],
        confidenceClassification: {
          level: 'Insufficient',
          narrative:
            'No demand signals were found — the only content present was personal founder motivation, ' +
            'which is not evidence of market demand.',
          citedSignalIndices: [],
        },
      },
    });

    const result = await analyzeDemand(investigationId);

    expect(result.demandSignalCandidates).toHaveLength(0);
    expect(result.demandConfidenceClassificationCandidate.level).toBe('Insufficient');
    expect(result.demandConfidenceClassificationCandidate.citedDemandSignalIds).toHaveLength(0);
    expect(result.demandConfidenceClassificationCandidate.narrative.length).toBeGreaterThan(0);
    expect(result.demandConfidenceClassificationCandidate.negativeFindingSignal).toBeDefined();
    expect(result.demandConfidenceClassificationCandidate.negativeFindingSignal?.statement.length).toBeGreaterThan(0);
  });

  it('given demandSignals non-empty but citedSignalIndices empty, negativeFindingSignal is NOT triggered', async () => {
    const { investigationId } = await seedInvestigationWithEvidence([
      'One customer mentioned switching away from a competitor product last month.',
    ]);

    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        demandSignals: [{ type: 'switching-behavior', evidenceIndices: [0] }],
        confidenceClassification: {
          level: 'Insufficient',
          // Deliberately does NOT cite the switching-behavior signal — this is the subtle case:
          // signals were found, but none specifically drove the (still-Insufficient) classification.
          narrative: 'A single switching-behavior mention is not enough on its own to substantiate demand.',
          citedSignalIndices: [],
        },
      },
    });

    const result = await analyzeDemand(investigationId);

    expect(result.demandSignalCandidates).toHaveLength(1);
    expect(result.demandConfidenceClassificationCandidate.citedDemandSignalIds).toHaveLength(0);
    expect(result.demandConfidenceClassificationCandidate.negativeFindingSignal).toBeUndefined();
  });

  it('drops a demand signal whose evidenceIndices resolve to zero valid evidence items (fail-closed, not persisted-empty)', async () => {
    const { investigationId } = await seedInvestigationWithEvidence([
      'One legitimate observation about existing spend on a workaround tool.',
    ]);

    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        demandSignals: [
          { type: 'existing-spend', evidenceIndices: [0] },
          // Out-of-range index — the model hallucinated a reference to non-existent evidence.
          { type: 'feature-requests', evidenceIndices: [99] },
        ],
        confidenceClassification: {
          level: 'Emerging',
          narrative: 'Existing spend indicates emerging demand.',
          citedSignalIndices: [0],
        },
      },
    });

    const result = await analyzeDemand(investigationId);

    expect(result.demandSignalCandidates).toHaveLength(1);
    expect(result.demandSignalCandidates[0].type).toBe('existing-spend');
  });

  it('never surfaces a system-generated numeric confidence/score field', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['A single piece of evidence.']);

    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        demandSignals: [{ type: 'recurring-complaints', evidenceIndices: [0] }],
        confidenceClassification: {
          level: 'Emerging',
          narrative: '3 customers mentioned this in their complaints, which is a modest but real signal.',
          citedSignalIndices: [0],
        },
      },
    });

    const result = await analyzeDemand(investigationId);

    expect(typeof result.demandConfidenceClassificationCandidate.level).toBe('string');
    expect('score' in result.demandConfidenceClassificationCandidate).toBe(false);
    expect('confidenceScore' in result.demandConfidenceClassificationCandidate).toBe(false);
    // Structural check (not tied to any specific field name): no top-level value on the
    // classification candidate, nor on any demand signal candidate, may be a number — this would
    // catch a future regression that introduces a numeric field under any name, not just
    // 'score'/'confidenceScore'.
    for (const value of Object.values(result.demandConfidenceClassificationCandidate)) {
      expect(typeof value).not.toBe('number');
    }
    for (const signal of result.demandSignalCandidates) {
      for (const value of Object.values(signal)) {
        expect(typeof value).not.toBe('number');
      }
    }
    // A sourced numeric claim IN the narrative text is fine — not itself a violation (Q-1).
    expect(result.demandConfidenceClassificationCandidate.narrative).toContain('3 customers');
  });

  it('returns generationFailed:true with no negativeFindingSignal when no evidence exists for the Investigation', async () => {
    const submission = await submitSources({ origin: 'human', artifacts: [{ type: 'text', raw: 'no evidence extracted yet' }] });

    const result = await analyzeDemand(submission.investigationId);

    expect(result.generationFailed).toBe(true);
    expect(result.demandSignalCandidates).toHaveLength(0);
    expect(result.demandConfidenceClassificationCandidate.level).toBe('Insufficient');
    expect(result.demandConfidenceClassificationCandidate.negativeFindingSignal).toBeUndefined();
    expect(callForcedTool).not.toHaveBeenCalled();
  });

  it('Edge Case (mirrors recommendationEngine.test.ts:164, Numeric Scope Rule): the prompt sent to the model carries an explicit instruction not to adopt an unverifiable sourced numeric claim (e.g. a "$50M market" figure) into the narrative as validated fact', async () => {
    const { investigationId } = await seedInvestigationWithEvidence([
      'A source claims the addressable market for this is "$50M", but offers no citation or corroboration.',
    ]);

    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        demandSignals: [],
        confidenceClassification: {
          level: 'Insufficient',
          narrative:
            'A source cites a "$50M market" figure, but this is an uncorroborated, unverified ' +
            'claim, not an established fact.',
          citedSignalIndices: [],
        },
      },
    });

    await analyzeDemand(investigationId);

    expect(callForcedTool).toHaveBeenCalledTimes(1);
    const call = vi.mocked(callForcedTool).mock.calls[0][0];
    // Guard instruction lives in demandAnalyzer.ts's buildUserPrompt — this asserts it is actually
    // present in what gets sent to the model, not merely present in the source file.
    expect(call.userPrompt).toMatch(/must not adopt an unverifiable numeric claim/);
    expect(call.userPrompt).toMatch(/must not restate the number itself as validated/);
  });
});
