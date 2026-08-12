import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

/** DDR-0001 (ACCEPTED): Claude Agent SDK / direct Anthropic API using forced tool-use for
 *  schema-constrained structured output. This is the sole LLM call site pattern for the codebase
 *  — every component that needs literal-union- or NonEmptyArray-constrained output from the model
 *  goes through `callForcedTool` below, never free-text generation (DDR-0001's spike confirmed
 *  free-text drifts off-schema). */
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5-20250929';

/** R-4 (Danny, binding, Architecture §3/§4): at most one repair attempt, i.e. at most two total
 *  generation attempts per call (original + one repair). Configuration, not hardcoded per call
 *  site. */
const MAX_REPAIR_ATTEMPTS = 1;

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
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
 *  bounded repair attempt (R-4 fail-closed — never silently coerced). `rawOutput` and
 *  `validationErrors` retain every attempt's detail for provenance, matching Architecture §3's
 *  SchemaValidationRecord/SchemaValidationAttempt shape (full GenerationStep/GenerationRun
 *  provenance wiring is Slice 8 scope; this class carries the minimum this slice needs). */
export class LlmValidationError extends Error {
  constructor(
    message: string,
    public readonly rawOutput: unknown,
    public readonly attempts: number,
  ) {
    super(message);
    this.name = 'LlmValidationError';
  }
}

export interface ForcedToolCallResult<T> {
  value: T;
  attempts: number; // 1 = valid on first attempt, 2 = required the one repair attempt
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

  let lastRawOutput: unknown;
  let lastError = '';

  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS + 1; attempt++) {
    const userContent =
      attempt === 1
        ? params.userPrompt
        : `${params.userPrompt}\n\n---\nYour previous tool call failed schema validation.\n` +
          `Validation error: ${lastError}\n` +
          `Previous tool input: ${JSON.stringify(lastRawOutput)}\n` +
          `Produce a corrected tool call that fixes this error.`;

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

    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (!toolUseBlock) {
      lastRawOutput = response.content;
      lastError = 'model response contained no tool_use block';
      continue;
    }

    lastRawOutput = toolUseBlock.input;
    const result = params.validate(toolUseBlock.input);
    if (result.valid) {
      return { value: result.value, attempts: attempt };
    }
    lastError = result.error;
  }

  throw new LlmValidationError(
    `callForcedTool: "${params.toolName}" failed schema validation after ${MAX_REPAIR_ATTEMPTS + 1} attempt(s): ${lastError}`,
    lastRawOutput,
    MAX_REPAIR_ATTEMPTS + 1,
  );
}
