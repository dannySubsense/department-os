import { callForcedTool, LlmValidationError } from './llmClient.js';
import type { DemandAnalysisResult } from './demandAnalyzer.js';
import type { LandscapeResearchResult } from './landscapeResearcher.js';
import type { GapHypothesisGenerationResult } from './gapHypothesisGenerator.js';
import type {
  ProblemStatementCandidate,
  RecommendationCandidate,
  RecommendationDecision,
  UncertaintyStatementCandidate,
} from '../types/domain.js';

const RECOMMENDATION_DECISIONS: RecommendationDecision[] = ['Approve', 'Reject', 'Watch'];

const TOOL_NAME = 'generate_recommendation';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    decision: {
      type: 'string',
      enum: RECOMMENDATION_DECISIONS,
      description: 'Exactly one recommendation decision.',
    },
    rationale: {
      type: 'string',
      description:
        'A narrative rationale that references specific evidence/signals/gaps by content — never ' +
        'a bare label and never a system-generated numeric score. Must not restate an ' +
        'unverifiable numeric claim from assumption/unknown-labeled evidence as established fact.',
    },
  },
  required: ['decision', 'rationale'],
} as const;

interface RawRecommendation {
  decision: string;
  rationale: string;
}

function validateRawRecommendation(
  input: unknown,
): { valid: true; value: RawRecommendation } | { valid: false; error: string } {
  if (typeof input !== 'object' || input === null) {
    return { valid: false, error: 'tool input is not an object' };
  }
  const obj = input as Record<string, unknown>;
  if (
    typeof obj.decision !== 'string' ||
    !RECOMMENDATION_DECISIONS.includes(obj.decision as RecommendationDecision)
  ) {
    return { valid: false, error: `decision must be one of ${RECOMMENDATION_DECISIONS.join(', ')}` };
  }
  if (typeof obj.rationale !== 'string' || obj.rationale.length === 0) {
    return { valid: false, error: 'rationale must be a non-empty string' };
  }
  return { valid: true, value: obj as unknown as RawRecommendation };
}

export interface RecommendationEngineInput {
  problemStatementCandidates: ProblemStatementCandidate[];
  demandAnalysis: DemandAnalysisResult;
  landscapeResearch: LandscapeResearchResult;
  gapHypothesisGeneration: GapHypothesisGenerationResult;
  /** The ALREADY-COMPILED uncertainty output — the sole channel through which an upstream Slice
   *  5/6 generationFailed is represented here (Architecture §1.8 boundary discussion). This
   *  function never reads demandAnalysis/landscapeResearch/gapHypothesisGeneration.generationFailed
   *  itself to make its own decision. */
  uncertaintyStatementCandidate: UncertaintyStatementCandidate;
}

export interface RecommendationResult {
  recommendationCandidate: RecommendationCandidate;
  /** Own failure only — never derived from any upstream component's generationFailed. */
  generationFailed: boolean;
  generationFailureReason?: string;
}

function buildUserPrompt(input: RecommendationEngineInput): string {
  const problemStatementsBlock = input.problemStatementCandidates
    .map(
      (p, i) =>
        `[${i}] who=${p.whoExperiencesIt}; context=${p.contextOrWorkflow}; friction=${p.consequenceOrFriction}`,
    )
    .join('\n');
  const demandBlock =
    `Demand confidence: ${input.demandAnalysis.demandConfidenceClassificationCandidate.level} — ` +
    `${input.demandAnalysis.demandConfidenceClassificationCandidate.narrative}\n` +
    input.demandAnalysis.demandSignalCandidates
      .map((s, i) => `  signal[${i}] type=${s.type}`)
      .join('\n');
  const solutionsBlock = input.landscapeResearch.existingSolutionCandidates
    .map((s, i) => `[${i}] ${s.name} — inadequate: ${s.whereItsInadequate}`)
    .join('\n');
  const gapsBlock = input.gapHypothesisGeneration.gapHypothesisCandidates
    .map((g, i) => `[${i}] (${g.category}) ${g.statement}`)
    .join('\n');
  const uncertaintyBlock =
    `whatsUnknown:\n${input.uncertaintyStatementCandidate.whatsUnknown.map((s) => `- ${s}`).join('\n')}\n` +
    `whatWouldChangeConclusion:\n${input.uncertaintyStatementCandidate.whatWouldChangeConclusion
      .map((s) => `- ${s}`)
      .join('\n')}\n` +
    `whatsUndeterminable:\n${input.uncertaintyStatementCandidate.whatsUndeterminable
      .map((s) => `- ${s}`)
      .join('\n')}`;

  return (
    `Produce exactly one recommendation decision (Approve, Reject, or Watch) and a rationale for ` +
    `this Investigation's Brief candidate, given the problem statements, demand analysis, ` +
    `landscape, gap hypotheses, and compiled uncertainty below.\n\n` +
    `PROBLEM STATEMENTS:\n${problemStatementsBlock}\n\n` +
    `DEMAND:\n${demandBlock}\n\n` +
    `EXISTING SOLUTIONS:\n${solutionsBlock}\n\n` +
    `GAP HYPOTHESES:\n${gapsBlock}\n\n` +
    `UNCERTAINTY:\n${uncertaintyBlock}\n\n` +
    `Instructions:\n` +
    `- The rationale must reference specific evidence/signals/gaps by content, never a bare label ` +
    `and never a system-generated numeric score.\n` +
    `- The rationale must not adopt an unverifiable numeric claim from evidence (e.g. a source's ` +
    `market-size figure) as an established fact — if such a figure appears only in ` +
    `assumption/unknown-labeled evidence or as an uncorroborated claim, you may reference that the ` +
    `claim exists and is unverified, but must not restate the number itself as validated.`
  );
}

/** Recommendation Engine (Architecture §1.8, Roadmap Slice 7). Consumes ONLY the already-compiled
 *  `UncertaintyStatementCandidate` — never the raw upstream `generationFailed` flags directly — per
 *  the generationFailed-collision boundary decision in Architecture §1.8. Same F-1 outer
 *  try/catch, same R-4 validate-repair-fail forced-tool call discipline as
 *  `analyzeDemand`/`researchLandscape`/`generateGapHypotheses`. No `negativeFindingSignal`:
 *  `RecommendationDecision` is a closed three-value union with no "none/unknown" member, and
 *  `Recommendation` is not one of `BriefElement`'s four negatable elements — always produced on
 *  success, never recorded as an explicit absence. */
export async function generateRecommendation(
  input: RecommendationEngineInput,
): Promise<RecommendationResult> {
  const fallbackCandidate = (reason: string): RecommendationCandidate => ({
    decision: 'Watch',
    rationale: `Recommendation could not be generated with confidence: ${reason}`,
  });

  try {
    // Step 1: defensive guard — should be unreachable given Q-2's upstream fail-closed guarantee.
    if (input.problemStatementCandidates.length === 0) {
      const reason = 'No ProblemStatement candidates are available for this Investigation.';
      return {
        recommendationCandidate: fallbackCandidate(reason),
        generationFailed: true,
        generationFailureReason: reason,
      };
    }

    let raw: RawRecommendation;
    try {
      const result = await callForcedTool<RawRecommendation>({
        systemPrompt:
          'You are the Recommendation Engine for Department OS Problem Department. You produce a ' +
          'single Approve/Reject/Watch decision with an evidence-referencing rationale, strictly ' +
          'via the provided tool call — never respond in free text.',
        userPrompt: buildUserPrompt(input),
        toolName: TOOL_NAME,
        toolDescription: 'Record the recommendation decision and rationale.',
        inputSchema: INPUT_SCHEMA,
        validate: validateRawRecommendation,
      });
      raw = result.value;
    } catch (err) {
      if (err instanceof LlmValidationError) {
        const reason = `Recommendation generation failed schema validation after bounded repair: ${err.message}`;
        return {
          recommendationCandidate: fallbackCandidate(reason),
          generationFailed: true,
          generationFailureReason: reason,
        };
      }
      throw err;
    }

    return {
      recommendationCandidate: {
        decision: raw.decision as RecommendationDecision,
        rationale: raw.rationale,
      },
      generationFailed: false,
    };
  } catch (err) {
    const reason = `Recommendation generation failed with an unexpected error: ${
      err instanceof Error ? err.message : String(err)
    }`;
    return {
      recommendationCandidate: fallbackCandidate(reason),
      generationFailed: true,
      generationFailureReason: reason,
    };
  }
}
