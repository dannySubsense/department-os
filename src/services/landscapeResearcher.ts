import { randomUUID } from 'node:crypto';
import { getEvidenceForInvestigation } from './getEvidenceForInvestigation.js';
import { searchWeb } from './searchWeb.js';
import { extractClaimsAndEvidenceForSourceArtifacts } from './extractClaimsAndEvidence.js';
import { callForcedTool, LlmValidationError } from './llmClient.js';
import type {
  EvidenceItem,
  ExistingSolutionCandidate,
  NonEmptyArray,
  WebSearchQuery,
} from '../types/domain.js';

// ---- Raw (unvalidated-beyond-shape) shapes the model's tool calls return ----

interface RawProposedQueries {
  queries: string[];
}

interface RawExistingSolution {
  name: string;
  whatItAddresses: string;
  howPeopleCopeNow: string;
  whereItsInadequate: string;
  evidenceIndices: number[];
}

interface RawExistingSolutions {
  existingSolutions: RawExistingSolution[];
}

const PROPOSE_QUERIES_TOOL_NAME = 'propose_landscape_queries';

const PROPOSE_QUERIES_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    queries: {
      type: 'array',
      minItems: 1,
      items: { type: 'string' },
      description:
        'One or more independent web search queries aimed at finding existing solutions, ' +
        'competitors, or alternatives for the problem the evidence below describes. Never limit ' +
        'the search to what the evidence itself already names as a competitor — research ' +
        'independently.',
    },
  },
  required: ['queries'],
} as const;

const IDENTIFY_SOLUTIONS_TOOL_NAME = 'identify_existing_solutions';

const IDENTIFY_SOLUTIONS_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    existingSolutions: {
      type: 'array',
      description:
        'Zero or more existing solutions/competitors/alternatives identified from the combined ' +
        'evidence below. An empty array is a valid, expected result when no existing solution is ' +
        'established by the evidence — do not invent one to avoid an empty array.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          whatItAddresses: { type: 'string' },
          howPeopleCopeNow: { type: 'string' },
          whereItsInadequate: { type: 'string' },
          evidenceIndices: {
            type: 'array',
            minItems: 1,
            items: { type: 'integer' },
            description:
              'Indices into the EVIDENCE array (below) that establish this existing solution. Must ' +
              'cite at least one piece of evidence — never leave this empty.',
          },
        },
        required: ['name', 'whatItAddresses', 'howPeopleCopeNow', 'whereItsInadequate', 'evidenceIndices'],
      },
    },
  },
  required: ['existingSolutions'],
} as const;

function validateRawProposedQueries(
  input: unknown,
): { valid: true; value: RawProposedQueries } | { valid: false; error: string } {
  if (typeof input !== 'object' || input === null) {
    return { valid: false, error: 'tool input is not an object' };
  }
  const obj = input as Record<string, unknown>;
  if (!Array.isArray(obj.queries) || obj.queries.length === 0) {
    return { valid: false, error: 'queries must be a non-empty array' };
  }
  for (let i = 0; i < obj.queries.length; i++) {
    if (typeof obj.queries[i] !== 'string' || (obj.queries[i] as string).length === 0) {
      return { valid: false, error: `queries[${i}] is missing/invalid` };
    }
  }
  return { valid: true, value: obj as unknown as RawProposedQueries };
}

function validateRawExistingSolutions(
  input: unknown,
): { valid: true; value: RawExistingSolutions } | { valid: false; error: string } {
  if (typeof input !== 'object' || input === null) {
    return { valid: false, error: 'tool input is not an object' };
  }
  const obj = input as Record<string, unknown>;
  if (!Array.isArray(obj.existingSolutions)) {
    return { valid: false, error: 'existingSolutions is not an array' };
  }
  for (let i = 0; i < obj.existingSolutions.length; i++) {
    const s = obj.existingSolutions[i] as Record<string, unknown>;
    if (typeof s?.name !== 'string' || s.name.length === 0) {
      return { valid: false, error: `existingSolutions[${i}].name is missing/invalid` };
    }
    if (typeof s?.whatItAddresses !== 'string' || s.whatItAddresses.length === 0) {
      return { valid: false, error: `existingSolutions[${i}].whatItAddresses is missing/invalid` };
    }
    if (typeof s?.howPeopleCopeNow !== 'string' || s.howPeopleCopeNow.length === 0) {
      return { valid: false, error: `existingSolutions[${i}].howPeopleCopeNow is missing/invalid` };
    }
    if (typeof s?.whereItsInadequate !== 'string' || s.whereItsInadequate.length === 0) {
      return { valid: false, error: `existingSolutions[${i}].whereItsInadequate is missing/invalid` };
    }
    if (!Array.isArray(s?.evidenceIndices) || s.evidenceIndices.length === 0) {
      return { valid: false, error: `existingSolutions[${i}].evidenceIndices must be a non-empty array` };
    }
    for (const idx of s.evidenceIndices) {
      if (typeof idx !== 'number') {
        return { valid: false, error: `existingSolutions[${i}].evidenceIndices contains a non-numeric index` };
      }
    }
  }
  return { valid: true, value: obj as unknown as RawExistingSolutions };
}

function buildProposeQueriesUserPrompt(evidenceItems: EvidenceItem[]): string {
  const evidenceBlock = evidenceItems
    .map((e, i) => `[${i}] (sourceArtifactId=${e.sourceArtifactId}, label=${e.label}) ${e.excerptOrSummary}`)
    .join('\n');

  return (
    `The following evidence, extracted from an Investigation's sources, describes a problem. ` +
    `Propose one or more independent web search queries to find existing solutions, competitors, ` +
    `or alternatives for this problem.\n\n` +
    `EVIDENCE:\n${evidenceBlock}\n\n` +
    `Instructions:\n` +
    `- Use the evidence only to understand WHAT problem to research solutions for — never limit ` +
    `your queries to competitors the evidence itself already names; research independently of any ` +
    `claim the evidence makes about the landscape.\n` +
    `- Each query should be a natural web search string, not a list of keywords.`
  );
}

function buildIdentifySolutionsUserPrompt(evidenceItems: EvidenceItem[]): string {
  const evidenceBlock = evidenceItems
    .map((e, i) => `[${i}] (sourceArtifactId=${e.sourceArtifactId}, label=${e.label}) ${e.excerptOrSummary}`)
    .join('\n');

  return (
    `Identify existing solutions, competitors, or alternatives established by the combined ` +
    `evidence below (original Investigation evidence plus newly-retrieved landscape web-research ` +
    `evidence).\n\n` +
    `EVIDENCE:\n${evidenceBlock}\n\n` +
    `Instructions:\n` +
    `- Only record a solution the evidence actually establishes — an empty array is a valid, ` +
    `expected result when the evidence establishes no existing solution.\n` +
    `- For each existing solution, describe what it addresses, how people cope with the problem ` +
    `today using it, and where it falls short/is inadequate.\n` +
    `- Every existing solution must cite at least one evidenceIndex — never propose one with zero ` +
    `cited evidence.`
  );
}

export interface LandscapeResearchResult {
  webSearchQueries: WebSearchQuery[]; // one per searchWeb call issued this run
  existingSolutionCandidates: ExistingSolutionCandidate[];
  /** EvidenceItems extracted from newly-retrieved landscape-research SourceArtifacts this run —
   *  returned so the Gap Hypothesis Generator and Slice 9 don't have to re-derive this set. */
  landscapeEvidenceItems: EvidenceItem[];
  /** Mirrors demandAnalyzer's generationFailed pattern — set on infra/LLM failure only, never on a
   *  legitimate zero-competitors finding (see negativeFindingSignal). */
  generationFailed: boolean;
  generationFailureReason?: string;
  /** Populated iff existingSolutionCandidates is empty AND generationFailed === false — carries
   *  what Slice 9 needs to construct a NegativeFinding row with element: 'existing-solution'
   *  (roadmap Slice 6 Implementation Notes). Unset on every generationFailed: true path. */
  negativeFindingSignal?: { statement: string };
}

/** Landscape Researcher (Architecture §1.7, Roadmap Slice 6). Reads an Investigation's
 *  already-persisted evidence (Slice 4), proposes independent web search queries via a forced-tool
 *  LLM call, issues `searchWeb` calls sequentially, extracts `EvidenceItem`s from any
 *  newly-retrieved landscape-research `SourceArtifact`s via the scoped extraction function, then
 *  identifies `ExistingSolutionCandidate`s via a second forced-tool LLM call over the combined
 *  (original + landscape) evidence. Does not persist `ExistingSolution` rows — candidate-only until
 *  Slice 9, same as `DemandSignalCandidate`.
 *
 *  Same F-1 outer try/catch discipline as `analyzeDemand`: the entire function body, including the
 *  evidence read, is wrapped so any unexpected error converts to `generationFailed: true` rather
 *  than an unhandled throw. Same F-2-style fail-closed per-entity filtering: an existing-solution
 *  candidate whose evidenceIndices resolve to zero valid combined-evidence items is dropped; if the
 *  model proposed ≥1 solution but the filter drops all of them, the whole result is
 *  `generationFailed: true`, not a confident empty result. */
export async function researchLandscape(
  investigationId: string,
  generationRunId: string,
): Promise<LandscapeResearchResult> {
  // Declared here (outside the try) so the outer catch can see what was ACTUALLY issued so far —
  // searchWeb() commits each WebSearchQuery/WebSearchResult/QueryLimitation to the DB per call, so
  // if a later call in the loop throws, the earlier ones are already persisted and must not be
  // reported as an empty array (per this project's "failed/blocked retrievals are recorded, never
  // silently dropped" rule).
  const issuedWebSearchQueries: WebSearchQuery[] = [];
  try {
    const originalEvidenceItems = await getEvidenceForInvestigation(investigationId);

    if (originalEvidenceItems.length === 0) {
      return {
        webSearchQueries: [],
        existingSolutionCandidates: [],
        landscapeEvidenceItems: [],
        generationFailed: true,
        generationFailureReason:
          'No EvidenceItem is available for this Investigation — landscape research cannot run.',
      };
    }

    let rawQueries: RawProposedQueries;
    try {
      const result = await callForcedTool<RawProposedQueries>({
        systemPrompt:
          'You are the Landscape Researcher for Department OS Problem Department. You propose ' +
          'independent web search queries to find existing solutions/competitors/alternatives for ' +
          'a problem described by evidence, strictly via the provided tool call — never respond in ' +
          'free text.',
        userPrompt: buildProposeQueriesUserPrompt(originalEvidenceItems),
        toolName: PROPOSE_QUERIES_TOOL_NAME,
        toolDescription: 'Record one or more proposed web search queries.',
        inputSchema: PROPOSE_QUERIES_INPUT_SCHEMA,
        validate: validateRawProposedQueries,
      });
      rawQueries = result.value;
    } catch (err) {
      if (err instanceof LlmValidationError) {
        return {
          webSearchQueries: [],
          existingSolutionCandidates: [],
          landscapeEvidenceItems: [],
          generationFailed: true,
          generationFailureReason: `Landscape query proposal failed schema validation after bounded repair: ${err.message}`,
        };
      }
      throw err;
    }

    for (const query of rawQueries.queries) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design, see doc comment
      const webSearchQuery = await searchWeb({ investigationId, generationRunId, query });
      issuedWebSearchQueries.push(webSearchQuery);
    }
    const webSearchQueries: WebSearchQuery[] = issuedWebSearchQueries;

    const retrievedSourceArtifactIds = webSearchQueries
      .flatMap((q) => q.results)
      .filter((r) => r.status === 'retrieved' && typeof r.sourceArtifactId === 'string')
      .map((r) => r.sourceArtifactId as string);

    let landscapeEvidenceItems: EvidenceItem[] = [];
    if (retrievedSourceArtifactIds.length > 0) {
      const extractionResult = await extractClaimsAndEvidenceForSourceArtifacts(
        investigationId,
        retrievedSourceArtifactIds,
      );
      // extractionResult.generationFailed answers "was a problem statement established?" — not
      // relevant to landscape research, where zero problem-statement candidates from competitor
      // pages is the expected normal outcome, not a failure. Evidence/claims are already committed
      // to the DB by the time this returns (extractClaimsAndEvidenceForSourceArtifacts persists
      // before returning), so only treat this as a landscapeResearcher-level failure when there is
      // no evidence to show for it — otherwise use the evidence and never silently drop it.
      if (extractionResult.evidenceItems.length === 0) {
        return {
          webSearchQueries,
          existingSolutionCandidates: [],
          landscapeEvidenceItems: [],
          generationFailed: true,
          generationFailureReason: `Landscape evidence extraction failed: ${extractionResult.generationFailureReason ?? 'unknown reason'}`,
        };
      }
      landscapeEvidenceItems = extractionResult.evidenceItems;
    }

    const combinedEvidenceItems = [...originalEvidenceItems, ...landscapeEvidenceItems];

    let rawSolutions: RawExistingSolutions;
    try {
      const result = await callForcedTool<RawExistingSolutions>({
        systemPrompt:
          'You are the Landscape Researcher for Department OS Problem Department. You identify ' +
          'existing solutions/competitors/alternatives from evidence, strictly via the provided ' +
          'tool call — never respond in free text.',
        userPrompt: buildIdentifySolutionsUserPrompt(combinedEvidenceItems),
        toolName: IDENTIFY_SOLUTIONS_TOOL_NAME,
        toolDescription: 'Record identified existing solutions/competitors/alternatives.',
        inputSchema: IDENTIFY_SOLUTIONS_INPUT_SCHEMA,
        validate: validateRawExistingSolutions,
      });
      rawSolutions = result.value;
    } catch (err) {
      if (err instanceof LlmValidationError) {
        return {
          webSearchQueries,
          existingSolutionCandidates: [],
          landscapeEvidenceItems,
          generationFailed: true,
          generationFailureReason: `Existing-solution identification failed schema validation after bounded repair: ${err.message}`,
        };
      }
      throw err;
    }

    const combinedEvidenceIds = combinedEvidenceItems.map((e) => e.id);
    const resolveIndex = (idx: number): string | undefined =>
      idx >= 0 && idx < combinedEvidenceIds.length ? combinedEvidenceIds[idx] : undefined;

    const existingSolutionCandidates: ExistingSolutionCandidate[] = [];
    for (const s of rawSolutions.existingSolutions) {
      const resolvedIds = Array.from(
        new Set(s.evidenceIndices.map(resolveIndex).filter((id): id is string => id !== undefined)),
      );
      if (resolvedIds.length === 0) continue;
      existingSolutionCandidates.push({
        localId: randomUUID(),
        name: s.name,
        whatItAddresses: s.whatItAddresses,
        howPeopleCopeNow: s.howPeopleCopeNow,
        whereItsInadequate: s.whereItsInadequate,
        evidenceItemIds: resolvedIds as NonEmptyArray<string>,
      });
    }

    // F-2-style rule: if the model proposed ≥1 existing solution but fail-closed filtering dropped
    // all of them, the result is untrustworthy, not a confident empty finding.
    if (rawSolutions.existingSolutions.length > 0 && existingSolutionCandidates.length === 0) {
      return {
        webSearchQueries,
        existingSolutionCandidates: [],
        landscapeEvidenceItems,
        generationFailed: true,
        generationFailureReason:
          'All proposed existing solutions were dropped by fail-closed per-entity evidence ' +
          'validation (every solution cited only invalid/unresolvable evidenceIndices).',
      };
    }

    return {
      webSearchQueries,
      existingSolutionCandidates,
      landscapeEvidenceItems,
      generationFailed: false,
      negativeFindingSignal:
        existingSolutionCandidates.length === 0
          ? {
              statement:
                'No existing solutions/competitors/alternatives were found in the reachable ' +
                'evidence (original + landscape web research) for this Investigation.',
            }
          : undefined,
    };
  } catch (err) {
    return {
      // Return what was ACTUALLY issued so far, not an empty array — searchWeb() commits each
      // query/results/limitation per call, so an error partway through the loop (e.g. query 3 of 4
      // throwing) still leaves queries 1-2 persisted in the DB; a `[]` here would misreport them as
      // never having happened.
      webSearchQueries: issuedWebSearchQueries,
      existingSolutionCandidates: [],
      landscapeEvidenceItems: [],
      generationFailed: true,
      generationFailureReason: `Landscape research failed with an unexpected error: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}
