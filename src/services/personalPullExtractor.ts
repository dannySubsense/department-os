import { getEvidenceForInvestigation } from './getEvidenceForInvestigation.js';
import { callForcedTool, LlmValidationError } from './llmClient.js';
import type { EvidenceItem, PersonalPullNoteCandidate } from '../types/domain.js';

export interface PersonalPullExtractionResult {
  personalPullNoteCandidates: PersonalPullNoteCandidate[];
  /** Unlike `analyzeDemand`'s `generationFailed`, this is informational only — Personal Pull is
   *  never a required Problem Brief element and this component never blocks generation on its
   *  absence (Architecture §2 component table, US-12). A `true` here just means the extractor
   *  could not run/complete this time; callers should treat it the same as a legitimate empty
   *  result, not as a run-blocking failure. */
  generationFailed: boolean;
  generationFailureReason?: string;
}

// ---- Raw (unvalidated-beyond-shape) shape the model's tool call returns ----

interface RawPersonalPullNote {
  evidenceIndex: number;
  text: string;
}

interface RawPersonalPullExtraction {
  personalPullNotes: RawPersonalPullNote[];
}

const TOOL_NAME = 'extract_personal_pull';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    personalPullNotes: {
      type: 'array',
      description:
        'Zero or more pieces of Personal Pull content — personal/motivational framing (e.g. ' +
        "founder passion, \"I want to build this because...\", personal frustration driving the " +
        'idea) that is NOT itself evidence of market demand. An empty array is a valid, expected ' +
        'result when no such content is present — do not invent any to avoid an empty array.',
      items: {
        type: 'object',
        properties: {
          evidenceIndex: {
            type: 'integer',
            description: 'Index into the EVIDENCE array (below) this Personal Pull content came from.',
          },
          text: {
            type: 'string',
            description: 'The Personal Pull content itself, quoted or closely paraphrased from that evidence.',
          },
        },
        required: ['evidenceIndex', 'text'],
      },
    },
  },
  required: ['personalPullNotes'],
} as const;

function validateRawPersonalPullExtraction(
  input: unknown,
): { valid: true; value: RawPersonalPullExtraction } | { valid: false; error: string } {
  if (typeof input !== 'object' || input === null) {
    return { valid: false, error: 'tool input is not an object' };
  }
  const obj = input as Record<string, unknown>;
  if (!Array.isArray(obj.personalPullNotes)) {
    return { valid: false, error: 'personalPullNotes is not an array' };
  }
  for (let i = 0; i < obj.personalPullNotes.length; i++) {
    const n = obj.personalPullNotes[i] as Record<string, unknown>;
    if (typeof n?.evidenceIndex !== 'number') {
      return { valid: false, error: `personalPullNotes[${i}].evidenceIndex is not a number` };
    }
    if (typeof n?.text !== 'string' || n.text.length === 0) {
      return { valid: false, error: `personalPullNotes[${i}].text is missing/invalid` };
    }
  }
  return { valid: true, value: obj as unknown as RawPersonalPullExtraction };
}

function buildUserPrompt(evidenceItems: EvidenceItem[]): string {
  const evidenceBlock = evidenceItems
    .map((e, i) => `[${i}] (sourceArtifactId=${e.sourceArtifactId}, label=${e.label}) ${e.excerptOrSummary}`)
    .join('\n');

  return (
    `Review the following evidence, extracted from an Investigation's sources, for Personal Pull ` +
    `content — personal or motivational framing (founder passion, "I want to build this because...", ` +
    `personal frustration behind the idea) as distinct from market/customer demand.\n\n` +
    `EVIDENCE:\n${evidenceBlock}\n\n` +
    `Instructions:\n` +
    `- Record only content that is genuinely personal/motivational framing, not observed customer ` +
    `or market behavior — market demand signals (complaints, workarounds, spend, willingness to ` +
    `pay, etc.) belong to a separate analysis and must NOT be recorded here.\n` +
    `- If no Personal Pull content is present, return an empty personalPullNotes array — do not ` +
    `invent any.\n` +
    `- Every note must cite the evidenceIndex it came from.`
  );
}

/** Personal Pull Extractor (Architecture §2 component table; Roadmap Slice 5). Reads the SAME
 *  `EvidenceItem`s the Demand Analyzer reads, but via a structurally separate LLM call — Personal
 *  Pull content is "never fed to the Demand Analyzer" (Architecture §3) and must never appear in
 *  `DemandSignalCandidate`/`DemandConfidenceClassificationCandidate` output. Produces
 *  `PersonalPullNoteCandidate`s only; does not persist anything (candidate-only, same pattern as
 *  `analyzeDemand` — Slice 9 is the sole persister, once a `BriefVersion` exists to own the
 *  eventual `PersonalPullNote` rows). */
export async function extractPersonalPull(investigationId: string): Promise<PersonalPullExtractionResult> {
  // F-1: the entire operation — including the evidence read below — is wrapped in this outer
  // try/catch, mirroring extractClaimsAndEvidence.ts's pattern, so ANY unexpected error (DB read
  // failure, LLM API error, etc.) converts to a clean `generationFailed: true` result instead of
  // an unhandled throw.
  try {
    const evidenceItems = await getEvidenceForInvestigation(investigationId);

    if (evidenceItems.length === 0) {
      return { personalPullNoteCandidates: [], generationFailed: false };
    }

    let raw: RawPersonalPullExtraction;
    try {
      const result = await callForcedTool<RawPersonalPullExtraction>({
        systemPrompt:
          'You are the Personal Pull Extractor for Department OS Problem Department. You identify ' +
          'personal/motivational framing in source evidence, strictly via the provided tool call — ' +
          'never respond in free text. You never record market/customer demand behavior here.',
        userPrompt: buildUserPrompt(evidenceItems),
        toolName: TOOL_NAME,
        toolDescription: 'Record Personal Pull (personal/motivational) content found in the evidence.',
        inputSchema: INPUT_SCHEMA,
        validate: validateRawPersonalPullExtraction,
      });
      raw = result.value;
    } catch (err) {
      if (err instanceof LlmValidationError) {
        // Non-blocking per this function's doc comment — Personal Pull is optional contextual
        // material, never a required Brief element, so a failure here degrades to "none found"
        // rather than propagating as a run-blocking error.
        return {
          personalPullNoteCandidates: [],
          generationFailed: true,
          generationFailureReason: `Personal Pull extraction failed schema validation after bounded repair: ${err.message}`,
        };
      }
      throw err;
    }

    const personalPullNoteCandidates: PersonalPullNoteCandidate[] = [];
    for (const n of raw.personalPullNotes) {
      const evidenceItem = evidenceItems[n.evidenceIndex];
      if (!evidenceItem) continue; // out-of-range/invented index — dropped, not fabricated
      personalPullNoteCandidates.push({
        sourceArtifactId: evidenceItem.sourceArtifactId,
        text: n.text,
        label: 'contextual-motivation',
      });
    }

    return { personalPullNoteCandidates, generationFailed: false };
  } catch (err) {
    return {
      personalPullNoteCandidates: [],
      generationFailed: true,
      generationFailureReason: `Personal Pull extraction failed with an unexpected error: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}
