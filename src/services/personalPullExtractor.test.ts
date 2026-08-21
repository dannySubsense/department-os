import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';

vi.mock('./llmClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./llmClient.js')>();
  return {
    ...actual,
    callForcedTool: vi.fn(),
  };
});

const { callForcedTool } = await import('./llmClient.js');
const { extractPersonalPull } = await import('./personalPullExtractor.js');
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

describe('extractPersonalPull', () => {
  it('produces PersonalPullNoteCandidates with the fixed label, from personal/motivational content', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigationWithEvidence([
      'The founder said they have always personally dreamed of building this product.',
    ]);

    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        personalPullNotes: [
          { evidenceIndex: 0, text: 'Founder has a long personal dream of building this.' },
        ],
      },
    });

    const result = await extractPersonalPull(investigationId);

    expect(result.generationFailed).toBe(false);
    expect(result.personalPullNoteCandidates).toHaveLength(1);
    expect(result.personalPullNoteCandidates[0].label).toBe('contextual-motivation');
    expect(result.personalPullNoteCandidates[0].sourceArtifactId).toBe(sourceArtifactId);
    expect(result.personalPullNoteCandidates[0].text.length).toBeGreaterThan(0);
  });

  it('given no Personal Pull content is present, produces zero candidates without error', async () => {
    const { investigationId } = await seedInvestigationWithEvidence([
      'Three customers said they currently pay a contractor to do this manually.',
    ]);

    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: { personalPullNotes: [] },
    });

    const result = await extractPersonalPull(investigationId);

    expect(result.generationFailed).toBe(false);
    expect(result.personalPullNoteCandidates).toHaveLength(0);
  });

  it('drops a note whose evidenceIndex is out of range (fail-closed, never fabricated)', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['One piece of evidence.']);

    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: { personalPullNotes: [{ evidenceIndex: 42, text: 'hallucinated reference' }] },
    });

    const result = await extractPersonalPull(investigationId);

    expect(result.personalPullNoteCandidates).toHaveLength(0);
  });

  it('Personal Pull framing never appears in DemandSignalCandidate/DemandConfidenceClassificationCandidate output — recorded only via extractPersonalPull', async () => {
    const { investigationId } = await seedInvestigationWithEvidence([
      'The founder said they have always personally dreamed of building this product.',
    ]);

    // Demand Analyzer, run over the SAME evidence, correctly finds no demand signal in
    // Personal-Pull-only content.
    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        demandSignals: [],
        confidenceClassification: {
          level: 'Insufficient',
          narrative: 'Only personal founder motivation was present — no market demand signal found.',
          citedSignalIndices: [],
        },
      },
    });
    const demandResult = await analyzeDemand(investigationId);

    // Personal Pull Extractor, run separately over the same evidence, records it.
    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        personalPullNotes: [
          { evidenceIndex: 0, text: 'Founder has a long personal dream of building this.' },
        ],
      },
    });
    const personalPullResult = await extractPersonalPull(investigationId);

    expect(demandResult.demandSignalCandidates).toHaveLength(0);
    expect(demandResult.demandConfidenceClassificationCandidate.narrative).not.toMatch(/dream/i);
    expect(personalPullResult.personalPullNoteCandidates).toHaveLength(1);
    expect(personalPullResult.personalPullNoteCandidates[0].label).toBe('contextual-motivation');

    // Verify these were genuinely TWO STRUCTURALLY SEPARATE LLM calls (distinct tool names/prompts),
    // not a single call whose output happened to be reshaped into both result types — a shape-only
    // check on the final output would not catch a regression where extraction logic silently
    // conflated the two categories behind the scenes.
    expect(callForcedTool).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(callForcedTool).mock.calls;
    const [demandCallArgs] = calls[0];
    const [personalPullCallArgs] = calls[1];
    expect(demandCallArgs.toolName).toBe('analyze_demand');
    expect(personalPullCallArgs.toolName).toBe('extract_personal_pull');
    expect(demandCallArgs.userPrompt).not.toBe(personalPullCallArgs.userPrompt);
    // The Demand Analyzer's prompt must explicitly instruct exclusion of Personal Pull content.
    expect(demandCallArgs.userPrompt).toMatch(/personal|motivation/i);
    expect(demandCallArgs.systemPrompt).toMatch(/never treat personal motivation/i);
  });

  it('returns generationFailed:false with zero candidates (non-blocking) when no evidence exists for the Investigation', async () => {
    const submission = await submitSources({ origin: 'human', artifacts: [{ type: 'text', raw: 'no evidence extracted yet' }] });

    const result = await extractPersonalPull(submission.investigationId);

    expect(result.generationFailed).toBe(false);
    expect(result.personalPullNoteCandidates).toHaveLength(0);
    expect(callForcedTool).not.toHaveBeenCalled();
  });
});
