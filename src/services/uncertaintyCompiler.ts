import { callForcedTool, LlmValidationError } from './llmClient.js';
import type { DemandAnalysisResult } from './demandAnalyzer.js';
import type { LandscapeResearchResult } from './landscapeResearcher.js';
import type { GapHypothesisGenerationResult } from './gapHypothesisGenerator.js';
import type {
  ClaimVersion,
  EvidenceItem,
  ProblemStatementCandidate,
  UncertaintyStatementCandidate,
} from '../types/domain.js';

const SENTINEL_WHATS_UNKNOWN =
  "No unresolved what's-unknown items were identified for this Investigation's evidence.";
const SENTINEL_WHAT_WOULD_CHANGE =
  'No specific finding that would change the conclusion was identified for this Investigation\'s evidence.';
const SENTINEL_WHATS_UNDETERMINABLE =
  "No unresolved what's-undeterminable items were identified for this Investigation's evidence.";

const TOOL_NAME = 'compile_uncertainty';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    whatsUnknown: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Zero or more things that remain unknown given the available evidence. Any seeded items ' +
        'supplied in the prompt MUST be included (verbatim or paraphrased without losing meaning) ' +
        '— add further items the evidence supports beyond these, but never drop a seeded item.',
    },
    whatWouldChangeConclusion: {
      type: 'array',
      items: { type: 'string' },
      description: 'Zero or more specific findings that, if obtained, would change the conclusion.',
    },
    whatsUndeterminable: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Zero or more things that cannot be determined from available sources. Any seeded items ' +
        'supplied in the prompt MUST be included (verbatim or paraphrased without losing meaning) ' +
        '— add further items the evidence supports beyond these, but never drop a seeded item.',
    },
  },
  required: ['whatsUnknown', 'whatWouldChangeConclusion', 'whatsUndeterminable'],
} as const;

interface RawUncertainty {
  whatsUnknown: string[];
  whatWouldChangeConclusion: string[];
  whatsUndeterminable: string[];
}

function validateRawUncertainty(
  input: unknown,
): { valid: true; value: RawUncertainty } | { valid: false; error: string } {
  if (typeof input !== 'object' || input === null) {
    return { valid: false, error: 'tool input is not an object' };
  }
  const obj = input as Record<string, unknown>;
  for (const key of ['whatsUnknown', 'whatWouldChangeConclusion', 'whatsUndeterminable'] as const) {
    if (!Array.isArray(obj[key])) {
      return { valid: false, error: `${key} is not an array` };
    }
    for (let i = 0; i < (obj[key] as unknown[]).length; i++) {
      const item = (obj[key] as unknown[])[i];
      if (typeof item !== 'string' || item.length === 0) {
        return { valid: false, error: `${key}[${i}] is missing/invalid` };
      }
    }
  }
  return { valid: true, value: obj as unknown as RawUncertainty };
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}

export interface UncertaintyCompilerInput {
  investigationId: string;
  problemStatementCandidates: ProblemStatementCandidate[];
  evidenceItems: EvidenceItem[];
  claimVersions: ClaimVersion[];
  demandAnalysis: DemandAnalysisResult;
  landscapeResearch: LandscapeResearchResult;
  gapHypothesisGeneration: GapHypothesisGenerationResult;
}

export interface UncertaintyCompilationResult {
  uncertaintyStatementCandidate: UncertaintyStatementCandidate;
  /** Own failure only — never a propagation of demandAnalysis/landscapeResearch/
   *  gapHypothesisGeneration.generationFailed (Architecture §1.8 boundary discussion). */
  generationFailed: boolean;
  generationFailureReason?: string;
}

function buildUserPrompt(
  input: UncertaintyCompilerInput,
  seededUnknown: string[],
  seededUndeterminable: string[],
): string {
  const problemStatementsBlock = input.problemStatementCandidates
    .map(
      (p, i) =>
        `[${i}] who=${p.whoExperiencesIt}; context=${p.contextOrWorkflow}; friction=${p.consequenceOrFriction}`,
    )
    .join('\n');
  const evidenceBlock = input.evidenceItems
    .map((e, i) => `[${i}] (label=${e.label}) ${e.excerptOrSummary}`)
    .join('\n');
  const claimsBlock = input.claimVersions
    .map((cv, i) => `[${i}] ${cv.text} (evidence count=${cv.evidence.length})`)
    .join('\n');
  const demandBlock = `Demand signals: ${input.demandAnalysis.demandSignalCandidates.length}; ` +
    `confidence level=${input.demandAnalysis.demandConfidenceClassificationCandidate.level}`;
  const landscapeBlock = `Existing solutions found: ${input.landscapeResearch.existingSolutionCandidates.length}`;
  const gapBlock = `Gap hypotheses found: ${input.gapHypothesisGeneration.gapHypothesisCandidates.length}`;
  const seededUnknownBlock =
    seededUnknown.length > 0
      ? `\n\nALREADY-IDENTIFIED (seeded) whatsUnknown items — MUST be included verbatim or ` +
        `paraphrased without losing meaning:\n${seededUnknown.map((s) => `- ${s}`).join('\n')}`
      : '';
  const seededUndeterminableBlock =
    seededUndeterminable.length > 0
      ? `\n\nALREADY-IDENTIFIED (seeded) whatsUndeterminable items — MUST be included verbatim or ` +
        `paraphrased without losing meaning:\n${seededUndeterminable.map((s) => `- ${s}`).join('\n')}`
      : '';

  return (
    `Compile the uncertainty statement for this Investigation's Brief candidate, given the ` +
    `problem statements, evidence, claims, and summary of demand/landscape/gap analysis below.\n\n` +
    `PROBLEM STATEMENTS:\n${problemStatementsBlock}\n\n` +
    `EVIDENCE:\n${evidenceBlock}\n\n` +
    `CLAIMS:\n${claimsBlock}\n\n` +
    `${demandBlock}\n${landscapeBlock}\n${gapBlock}` +
    `${seededUnknownBlock}${seededUndeterminableBlock}\n\n` +
    `Instructions:\n` +
    `- whatsUnknown: things that remain unknown given the available evidence.\n` +
    `- whatWouldChangeConclusion: specific findings that, if obtained, would change the conclusion.\n` +
    `- whatsUndeterminable: things that cannot be determined from available sources.\n` +
    `- Each array may be structurally empty at the tool-call level — only include items the ` +
    `evidence/context actually supports.`
  );
}

/** Uncertainty Compiler (Architecture §1.8, Roadmap Slice 7). Receives Slices 4-6's already-
 *  computed result objects, verbatim, by their own distinct field names — never calls
 *  `analyzeDemand`/`researchLandscape`/`generateGapHypotheses` itself. Deterministically
 *  (code-level, before any LLM call) seeds `whatsUndeterminable`/`whatsUnknown` content from
 *  upstream `generationFailed` flags and unresolved contradictions/low-certainty evidence — this
 *  is the single place in Slice 7 that re-interprets an upstream `generationFailed: true` into
 *  content; `compileUncertainty`'s OWN `generationFailed` is reserved strictly for its own
 *  LLM/infra failures (F-1 outer try/catch).
 *
 *  Never-empty-array policy: each of the three output arrays always contains at least one string
 *  — a genuinely-clean category gets one explicit sentinel sentence, never `[]`. */
export async function compileUncertainty(
  input: UncertaintyCompilerInput,
): Promise<UncertaintyCompilationResult> {
  try {
    // Step 1: defensive empty-input guard — should be unreachable given Q-2's upstream fail-closed
    // guarantee, but read defensively, not assumed.
    if (input.problemStatementCandidates.length === 0 && input.evidenceItems.length === 0) {
      return {
        uncertaintyStatementCandidate: {
          whatsUnknown: [SENTINEL_WHATS_UNKNOWN],
          whatWouldChangeConclusion: [SENTINEL_WHAT_WOULD_CHANGE],
          whatsUndeterminable: [SENTINEL_WHATS_UNDETERMINABLE],
        },
        generationFailed: true,
        generationFailureReason:
          'No ProblemStatement candidates and no EvidenceItems are available for this ' +
          'Investigation — uncertainty compilation cannot run.',
      };
    }

    // Step 2: deterministic, code-level seeding.
    const seededUndeterminable: string[] = [];
    const seededUnknown: string[] = [];

    const upstreamSteps: { name: string; result: { generationFailed: boolean; generationFailureReason?: string } }[] = [
      { name: 'Demand analysis', result: input.demandAnalysis },
      { name: 'Landscape research', result: input.landscapeResearch },
      { name: 'Gap hypothesis generation', result: input.gapHypothesisGeneration },
    ];
    for (const step of upstreamSteps) {
      if (step.result.generationFailed) {
        seededUndeterminable.push(
          `${step.name} could not be completed: ${step.result.generationFailureReason ?? 'unknown reason'}`,
        );
      }
    }

    for (const cv of input.claimVersions) {
      const hasContradiction = cv.evidence.some((e) => e.stance === 'contradicting');
      if (hasContradiction) {
        seededUnknown.push(
          `The claim "${cv.text}" has contradicting evidence on record and remains unresolved.`,
        );
      }
    }

    const lowCertaintyItems = input.evidenceItems.filter(
      (e) => e.label === 'assumption' || e.label === 'unknown',
    );
    if (lowCertaintyItems.length > 0) {
      const representative = lowCertaintyItems[0];
      seededUndeterminable.push(
        `${lowCertaintyItems.length} piece(s) of evidence were labeled assumption/unknown ` +
          `(e.g. "${representative.excerptOrSummary}"), limiting what can be determined with ` +
          `confidence.`,
      );
    }

    // Step 3: forced-tool LLM call.
    let raw: RawUncertainty;
    try {
      const result = await callForcedTool<RawUncertainty>({
        systemPrompt:
          'You are the Uncertainty Compiler for Department OS Problem Department. You identify ' +
          "what's unknown, what would change the conclusion, and what's undeterminable, strictly " +
          'via the provided tool call — never respond in free text.',
        userPrompt: buildUserPrompt(input, seededUnknown, seededUndeterminable),
        toolName: TOOL_NAME,
        toolDescription: 'Record the compiled uncertainty statement.',
        inputSchema: INPUT_SCHEMA,
        validate: validateRawUncertainty,
      });
      raw = result.value;
    } catch (err) {
      if (err instanceof LlmValidationError) {
        // Step 4: fallback — the seeded items are code-derived, not model-derived, so they are not
        // lost even on this failure path.
        return {
          uncertaintyStatementCandidate: {
            whatsUnknown: seededUnknown.length > 0 ? dedupe(seededUnknown) : [SENTINEL_WHATS_UNKNOWN],
            whatWouldChangeConclusion: [SENTINEL_WHAT_WOULD_CHANGE],
            whatsUndeterminable:
              seededUndeterminable.length > 0 ? dedupe(seededUndeterminable) : [SENTINEL_WHATS_UNDETERMINABLE],
          },
          generationFailed: true,
          generationFailureReason: `Uncertainty compilation failed schema validation after bounded repair: ${err.message}`,
        };
      }
      throw err;
    }

    // Step 5: merge, never-empty per category.
    const whatsUnknown = dedupe([...seededUnknown, ...raw.whatsUnknown]);
    const whatWouldChangeConclusion = dedupe(raw.whatWouldChangeConclusion);
    const whatsUndeterminable = dedupe([...seededUndeterminable, ...raw.whatsUndeterminable]);

    return {
      uncertaintyStatementCandidate: {
        whatsUnknown: whatsUnknown.length > 0 ? whatsUnknown : [SENTINEL_WHATS_UNKNOWN],
        whatWouldChangeConclusion:
          whatWouldChangeConclusion.length > 0 ? whatWouldChangeConclusion : [SENTINEL_WHAT_WOULD_CHANGE],
        whatsUndeterminable: whatsUndeterminable.length > 0 ? whatsUndeterminable : [SENTINEL_WHATS_UNDETERMINABLE],
      },
      generationFailed: false,
    };
  } catch (err) {
    return {
      uncertaintyStatementCandidate: {
        whatsUnknown: [SENTINEL_WHATS_UNKNOWN],
        whatWouldChangeConclusion: [SENTINEL_WHAT_WOULD_CHANGE],
        whatsUndeterminable: [SENTINEL_WHATS_UNDETERMINABLE],
      },
      generationFailed: true,
      generationFailureReason: `Uncertainty compilation failed with an unexpected error: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}
