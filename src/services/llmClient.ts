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

/** R-4 (Danny, binding, Architecture §3/§4): at most one repair attempt, i.e. at most two total
 *  generation attempts per call (original + one repair). Configuration, not hardcoded per call
 *  site. */
const MAX_REPAIR_ATTEMPTS = 1;

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
      max_tokens: 8192,
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

    if (!toolUseBlock) {
      lastRawOutput = response.content;
      lastError = 'model response contained no tool_use block';
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
