import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';

/** R-4 validator coverage for `extractPersonalPull` (QC finding F-4). `personalPullExtractor.test.ts`
 *  mocks `callForcedTool` entirely, which means `validateRawPersonalPullExtraction` — the real
 *  R-4 shape validator — never actually runs in that file. This file instead mocks the Anthropic
 *  SDK one layer down (same technique as `llmClient.test.ts`), leaving the real `callForcedTool`
 *  AND the real `validateRawPersonalPullExtraction` closure it is called with in the loop, so
 *  malformed model-shaped input is genuinely rejected by production validation code. Deliberately a
 *  separate file rather than added to `personalPullExtractor.test.ts`: that file's top-level
 *  `vi.mock('./llmClient.js', ...)` and this file's `vi.mock('@anthropic-ai/sdk', ...)` are
 *  mutually exclusive within one module graph. */
const createMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: createMock };
    },
  };
});

const { extractPersonalPull } = await import('./personalPullExtractor.js');

function toolUseResponse(input: unknown) {
  return {
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'extract_personal_pull', input }],
  };
}

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    'TRUNCATE claim_version_evidence, evidence_item, claim_version, claim, source_artifact, submission, investigation CASCADE',
  );
  createMock.mockReset();
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

async function seedInvestigationWithEvidence(excerpts: string[]): Promise<{ investigationId: string }> {
  const submission = await submitSources({
    origin: 'human',
    artifacts: [{ type: 'text', raw: excerpts.join('\n') }],
  });
  const sourceArtifactId = submission.sourceArtifactIds[0];
  for (const excerpt of excerpts) {
    await pool.query(
      `INSERT INTO evidence_item (source_artifact_id, excerpt_or_summary, label) VALUES ($1, $2, 'observation')`,
      [sourceArtifactId, excerpt],
    );
  }
  return { investigationId: submission.investigationId };
}

describe('extractPersonalPull — real validateRawPersonalPullExtraction (R-4) execution', () => {
  it('rejects a note whose evidenceIndex is not a number, on both the original and the one repair attempt', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['One piece of evidence.']);
    const badInput = { personalPullNotes: [{ evidenceIndex: 'zero', text: 'founder passion' }] };
    createMock.mockResolvedValueOnce(toolUseResponse(badInput)).mockResolvedValueOnce(toolUseResponse(badInput));

    const result = await extractPersonalPull(investigationId);

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(result.generationFailed).toBe(true);
    expect(result.personalPullNoteCandidates).toHaveLength(0);
    expect(result.generationFailureReason).toMatch(/personalPullNotes\[0\]\.evidenceIndex is not a number/);
  });

  it('rejects a note with missing/empty text', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['One piece of evidence.']);
    const badInput = { personalPullNotes: [{ evidenceIndex: 0, text: '' }] };
    createMock.mockResolvedValueOnce(toolUseResponse(badInput)).mockResolvedValueOnce(toolUseResponse(badInput));

    const result = await extractPersonalPull(investigationId);

    expect(result.generationFailed).toBe(true);
    expect(result.personalPullNoteCandidates).toHaveLength(0);
    expect(result.generationFailureReason).toMatch(/personalPullNotes\[0\]\.text is missing\/invalid/);
  });

  it('LlmValidationError path: rejects on the original attempt, the one repair attempt is ALSO invalid, and the run returns generationFailed:true with zero candidates (non-blocking degrade, not a crash)', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['One piece of evidence.']);
    createMock
      .mockResolvedValueOnce(toolUseResponse({ personalPullNotes: [{ evidenceIndex: 0 }] }))
      .mockResolvedValueOnce(toolUseResponse({ personalPullNotes: [{ evidenceIndex: 0 }] }));

    const result = await extractPersonalPull(investigationId);

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(result.generationFailed).toBe(true);
    expect(result.personalPullNoteCandidates).toHaveLength(0);
    expect(result.generationFailureReason).toMatch(
      /Personal Pull extraction failed schema validation after bounded repair/,
    );
  });

  it('F-1: a generic (non-validation) API error thrown by the LLM call is caught by the outer try/catch and converts to generationFailed:true instead of propagating as an unhandled rejection', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['One piece of evidence.']);
    createMock.mockRejectedValueOnce(new Error('simulated Anthropic API outage'));

    const result = await extractPersonalPull(investigationId);

    expect(result.generationFailed).toBe(true);
    expect(result.personalPullNoteCandidates).toHaveLength(0);
    expect(result.generationFailureReason).toMatch(
      /Personal Pull extraction failed with an unexpected error: simulated Anthropic API outage/,
    );
  });
});
