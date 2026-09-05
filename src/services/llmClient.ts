import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { recordToolInvocation } from './provenanceContext.js';
import type { SchemaValidationAttempt } from '../types/domain.js';

/** DDR-0001 (ACCEPTED): Claude Agent SDK / direct Anthropic API using forced tool-use for
 *  schema-constrained structured output. This is the sole LLM call site pattern for the codebase
 *  — every component that needs literal-union- or NonEmptyArray-constrained output from the model
 *  goes through `callForcedTool` below, never free-text generation (DDR-0001's spike confirmed
 *  free-text drifts off-schema). */
export const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5-20250929';

/** At most one repair attempt, i.e. at most two total generation attempts per call (original +
 *  one repair). Configuration, not hardcoded per call site. Corrected 2026-09-05
 *  (Frank spec-gate FAIL, benchmark-agent audit): the value 1 is confirmed live in
 *  problem-department-mvp/02-ARCHITECTURE.md §3 (lines 1529-2076, not §4 as previously cited —
 *  §4 does not discuss repair). That section's own stated basis — a quotation of Danny's decision
 *  text naming "1-2 attempts" as reasonable — does not appear verbatim anywhere in this repo's
 *  doc history; the citation chain terminates in an unreproducible quote. Unsourced: no
 *  mathematical, scientific, or programmatic precedent has been shown for stopping at exactly
 *  one repair. A label naming an owner is not a substitute for that evidence, so none is written
 *  here. Candidate real precedent not yet checked: whether real schema-validation failures in
 *  this pipeline's own attempt history (`SchemaValidationAttempt` records) tend to repair-succeed
 *  on attempt 2 or need more — that data may already exist and would be a real, reproducible
 *  basis for this number instead of an assumption. */
const MAX_REPAIR_ATTEMPTS = 1;

/** Unsourced — no mathematical, scientific, or programmatic precedent has been shown for 8192
 *  specifically. This value must not be treated as accepted: it has no named owner because
 *  nobody has reviewed real evidence for it, and "PROVISIONAL, owner: [name]" is not a
 *  substitute for that evidence — a label is not a citation. Requires a real measurement of
 *  extraction output size against source-set size (dispatch `benchmark`) before this constant
 *  can be either cited or replaced. The `response.stop_reason === 'max_tokens'` check in
 *  `callForcedTool` below reports this cap as truncation whenever it is hit, whether or not a
 *  (possibly incomplete) `tool_use` block happens to be present in the same response — a prior
 *  version of this comment claimed the no-tool_use-block branch alone covered this and that claim
 *  was false for the tool_use-block-present-but-truncated case; fixed 2026-09-05, Cold Frank
 *  spec-gate FAIL. */
const MAX_OUTPUT_TOKENS = 8192;

let cachedClient: Anthropic | null = null;

/** Exported so other call sites needing the raw Anthropic client (e.g. `searchWebAdapter.ts`'s
 *  provider-boundary `web_search` server-tool call, which is not a forced-tool structured-output
 *  call and so does not go through `callForcedTool`) share the same cached client/API-key
 *  handling rather than re-implementing it. */
export function getClient(): Anthropic {
  if (!cachedClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('llmClient: ANTHROPIC_API_KEY is not set (expected in .env or environment)');
    }
    cachedClient = new Anthropic({ apiKey });
  }
  return cachedClient;
}

/** Thrown when a forced-tool-use call fails schema validation on the original attempt AND the one
 *  bounded repair attempt (R-4 fail-closed — never silently coerced). `rawOutput` and `attempts`
 *  retain their original meaning (last raw output, attempt count) unchanged (Architecture §1.9
 *  point 2); `attemptHistory` (NEW, Slice 8) carries the full per-attempt record, matching the
 *  refined SchemaValidationAttempt shape. */
export class LlmValidationError extends Error {
  constructor(
    message: string,
    public readonly rawOutput: unknown,
    public readonly attempts: number,
    public readonly attemptHistory: SchemaValidationAttempt[] = [],
  ) {
    super(message);
    this.name = 'LlmValidationError';
  }
}

export interface ForcedToolCallResult<T> {
  value: T;
  attempts: number; // 1 = valid on first attempt, 2 = required the one repair attempt
  attemptHistory?: SchemaValidationAttempt[]; // NEW (Slice 8) — full per-attempt record, length
  // === attempts when populated, using the refined SchemaValidationAttempt shape (Architecture
  // §1.9 point 2). Optional so the many existing test files that construct
  // ForcedToolCallResult-shaped mock literals directly (bypassing callForcedTool itself) remain
  // unchanged — callForcedTool's own real return value always populates this field.
}

export interface CallForcedToolParams<T> {
  systemPrompt: string;
  userPrompt: string;
  toolName: string;
  toolDescription: string;
  /** JSON-schema-shaped input schema for the forced tool call (Anthropic's supported subset). */
  inputSchema: Record<string, unknown>;
  /** Runtime schema validation of the model's tool-call input (R-4) — enum membership, required
   *  fields, array shape. Referential-integrity / non-empty-citation checks that are specific to
   *  one entity within a larger multi-entity response are deliberately NOT this function's job —
   *  callers apply those as a separate, per-entity fail-closed filter after a structurally valid
   *  response is returned (see extractClaimsAndEvidence.ts for the stated rationale). */
  validate: (input: unknown) => { valid: true; value: T } | { valid: false; error: string };
}

/** Single forced-tool-use call with the R-4 validate -> repair-once -> hard-fail control loop.
 *  On repair, the prior invalid output and the validation error are fed back to the model
 *  verbatim, per Architecture §3's SchemaValidationAttempt shape. */
export async function callForcedTool<T>(
  params: CallForcedToolParams<T>,
): Promise<ForcedToolCallResult<T>> {
  const anthropic = getClient();
  // One callId per callForcedTool() invocation, shared by every attempt it makes — lets
  // provenanceRecorder.ts's buildValidationRecords correctly separate two distinct calls to the
  // same toolName within one GenerationStep (see CapturedToolInvocation.callId doc comment).
  const callId = randomUUID();

  let lastRawOutput: unknown;
  let lastError = '';
  const attemptHistory: SchemaValidationAttempt[] = [];

  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS + 1; attempt++) {
    const userContent =
      attempt === 1
        ? params.userPrompt
        : `${params.userPrompt}\n\n---\nYour previous tool call failed schema validation.\n` +
          `Validation error: ${lastError}\n` +
          `Previous tool input: ${JSON.stringify(lastRawOutput)}\n` +
          `Produce a corrected tool call that fixes this error.`;

    const startedAt = new Date().toISOString();
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: params.systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      tools: [
        {
          name: params.toolName,
          description: params.toolDescription,
          input_schema: params.inputSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: params.toolName },
    });
    const completedAt = new Date().toISOString();
    const tokenUsage = response.usage
      ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
      : undefined;

    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (response.stop_reason === 'max_tokens') {
      // The response was truncated at the token cap. This is checked BEFORE (and independent of)
      // whether a `tool_use` block is present: a forced tool call can be cut off mid-generation
      // either before any tool_use block is produced at all, or WHILE a tool_use block is being
      // generated — in the latter case `toolUseBlock` is truthy but its `input` is partial/
      // malformed JSON, which would otherwise be handed straight to `validate`, fail schema
      // validation for a reason that has nothing to do with the model's actual output quality, and
      // burn the one repair attempt while reporting a generic schema-validation error that hides
      // the real cause (truncation). Reported as truncation in both cases.
      lastRawOutput = toolUseBlock ? toolUseBlock.input : response.content;
      lastError =
        `model response was truncated at the ${MAX_OUTPUT_TOKENS}-token output cap` +
        (toolUseBlock
          ? ' while a tool_use block was still being generated (stop_reason: max_tokens) — the ' +
            'tool call input is partial/malformed as a result'
          : ' before a tool_use block could be produced (stop_reason: max_tokens)') +
        ' — this is NOT a model refusal or schema failure, the response was cut off mid-generation';
      const invalidAttempt: SchemaValidationAttempt = {
        attemptNumber: attempt,
        rawOutput: JSON.stringify(lastRawOutput),
        valid: false,
        validationError: lastError,
        startedAt,
        completedAt,
        modelIdentifier: MODEL,
        tokenUsage,
      };
      attemptHistory.push(invalidAttempt);
      recordToolInvocation({
        toolName: params.toolName,
        startedAt,
        completedAt,
        modelIdentifier: MODEL,
        attemptNumber: attempt,
        rawOutput: lastRawOutput,
        valid: false,
        validationError: lastError,
        tokenUsage,
        callId,
      });
      continue;
    }

    if (!toolUseBlock) {
      // This call forces a single client tool via `tool_choice: { type: 'tool', ... }`, so per the
      // SDK's own doc comment (`node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts`
      // lines 722-738), a response containing the forced tool_use block is the normal, complete
      // success path regardless of stop_reason. The `max_tokens` case is handled above, before this
      // branch, independent of tool_use-block presence. Reaching this branch means no tool_use
      // block was produced at all AND the response was not truncated at the token cap — every
      // remaining possible `stop_reason` value (`pause_turn`, `refusal`, `stop_sequence`,
      // `model_context_window_exceeded`, or even `end_turn`/`tool_use` on a malformed response) is
      // a genuine failure to fulfil the forced tool call, and the real value must be preserved and
      // reported — never collapsed into a generic message that discards it.
      lastRawOutput = response.content;
      lastError = `model response contained no tool_use block (stop_reason: ${response.stop_reason})`;
      const invalidAttempt: SchemaValidationAttempt = {
        attemptNumber: attempt,
        rawOutput: JSON.stringify(lastRawOutput),
        valid: false,
        validationError: lastError,
        startedAt,
        completedAt,
        modelIdentifier: MODEL,
        tokenUsage,
      };
      attemptHistory.push(invalidAttempt);
      recordToolInvocation({
        toolName: params.toolName,
        startedAt,
        completedAt,
        modelIdentifier: MODEL,
        attemptNumber: attempt,
        rawOutput: lastRawOutput,
        valid: false,
        validationError: lastError,
        tokenUsage,
        callId,
      });
      continue;
    }

    lastRawOutput = toolUseBlock.input;
    const result = params.validate(toolUseBlock.input);

    const thisAttempt: SchemaValidationAttempt = {
      attemptNumber: attempt,
      rawOutput: JSON.stringify(lastRawOutput),
      valid: result.valid,
      validationError: result.valid ? undefined : result.error,
      startedAt,
      completedAt,
      modelIdentifier: MODEL,
      tokenUsage,
    };
    attemptHistory.push(thisAttempt);
    recordToolInvocation({
      toolName: params.toolName,
      startedAt,
      completedAt,
      modelIdentifier: MODEL,
      attemptNumber: attempt,
      rawOutput: lastRawOutput,
      valid: result.valid,
      validationError: result.valid ? undefined : result.error,
      tokenUsage,
      callId,
    });

    if (result.valid) {
      return { value: result.value, attempts: attempt, attemptHistory };
    }
    lastError = result.error;
  }

  throw new LlmValidationError(
    `callForcedTool: "${params.toolName}" failed schema validation after ${MAX_REPAIR_ATTEMPTS + 1} attempt(s): ${lastError}`,
    lastRawOutput,
    MAX_REPAIR_ATTEMPTS + 1,
    attemptHistory,
  );
}
