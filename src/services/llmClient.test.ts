import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Dedicated unit coverage for `callForcedTool`'s R-4 validate -> repair-once -> hard-fail control
 *  loop (Architecture §3/§4, Danny-binding). This boundary was previously only exercised
 *  indirectly through `extractClaimsAndEvidence`'s tests, all of which mock `callForcedTool`
 *  itself — meaning nothing in the suite actually drove the repair loop or asserted it stops
 *  after exactly one repair attempt rather than looping indefinitely or silently coercing bad
 *  data. This file mocks the Anthropic SDK one layer down instead, so `callForcedTool`'s own
 *  control flow is the thing under test. */
const createMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: createMock };
    },
  };
});

const { callForcedTool, LlmValidationError } = await import('./llmClient.js');

function toolUseResponse(input: unknown) {
  return {
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'test_tool', input }],
  };
}

function noToolUseResponse() {
  return { content: [{ type: 'text', text: 'sorry, I refuse' }] };
}

beforeEach(() => {
  createMock.mockReset();
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

const baseParams = {
  systemPrompt: 'system',
  userPrompt: 'user',
  toolName: 'test_tool',
  toolDescription: 'a test tool',
  inputSchema: { type: 'object', properties: {} },
};

describe('callForcedTool (R-4 validate -> repair-once -> hard-fail)', () => {
  it('returns on the first attempt when validation passes immediately, without calling the model twice', async () => {
    createMock.mockResolvedValueOnce(toolUseResponse({ ok: true }));

    const result = await callForcedTool({
      ...baseParams,
      validate: (input) => ({ valid: true, value: input as { ok: boolean } }),
    });

    expect(result.value).toEqual({ ok: true });
    expect(result.attempts).toBe(1);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('repairs exactly once: a first invalid response is followed by exactly one more call, and success on that second attempt is returned', async () => {
    createMock
      .mockResolvedValueOnce(toolUseResponse({ ok: 'not-a-boolean' }))
      .mockResolvedValueOnce(toolUseResponse({ ok: true }));

    let calls = 0;
    const result = await callForcedTool({
      ...baseParams,
      validate: (input) => {
        calls++;
        const v = input as { ok: unknown };
        return typeof v.ok === 'boolean'
          ? { valid: true, value: v as { ok: boolean } }
          : { valid: false, error: 'ok must be boolean' };
      },
    });

    expect(result.value).toEqual({ ok: true });
    expect(result.attempts).toBe(2);
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(calls).toBe(2);

    // The repair call must feed the prior invalid output and error back to the model (Architecture
    // §3 SchemaValidationAttempt shape) — not a bare retry of the identical original prompt.
    const repairCallArgs = createMock.mock.calls[1][0];
    const repairUserContent = repairCallArgs.messages[0].content as string;
    expect(repairUserContent).toContain('ok must be boolean');
    expect(repairUserContent).toContain('not-a-boolean');
  });

  it('fails explicitly with LlmValidationError after exactly one repair attempt — never an open-ended retry loop', async () => {
    createMock
      .mockResolvedValueOnce(toolUseResponse({ ok: 'still-not-a-boolean' }))
      .mockResolvedValueOnce(toolUseResponse({ ok: 'still-not-a-boolean-again' }));

    const validate = (input: unknown) => {
      const v = input as { ok: unknown };
      return typeof v.ok === 'boolean'
        ? { valid: true as const, value: v as { ok: boolean } }
        : { valid: false as const, error: 'ok must be boolean' };
    };

    await expect(callForcedTool({ ...baseParams, validate })).rejects.toBeInstanceOf(
      LlmValidationError,
    );
    // Exactly 2 total model calls (original + the one bounded repair) — not 3, not an unbounded loop.
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('never silently coerces a still-invalid repaired response into a "success" — the thrown error carries the last raw output and attempt count', async () => {
    createMock
      .mockResolvedValueOnce(toolUseResponse({ ok: 'bad-1' }))
      .mockResolvedValueOnce(toolUseResponse({ ok: 'bad-2' }));

    const validate = (input: unknown) => {
      const v = input as { ok: unknown };
      return typeof v.ok === 'boolean'
        ? { valid: true as const, value: v as { ok: boolean } }
        : { valid: false as const, error: 'ok must be boolean' };
    };

    try {
      await callForcedTool({ ...baseParams, validate });
      expect.unreachable('callForcedTool should have thrown LlmValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(LlmValidationError);
      const validationErr = err as InstanceType<typeof LlmValidationError>;
      expect(validationErr.attempts).toBe(2);
      expect(validationErr.rawOutput).toEqual({ ok: 'bad-2' });
    }
  });

  it('treats a response with no tool_use block as a validation failure that also drives the repair loop, not a crash or silent pass', async () => {
    createMock.mockResolvedValueOnce(noToolUseResponse()).mockResolvedValueOnce(toolUseResponse({ ok: true }));

    const result = await callForcedTool({
      ...baseParams,
      validate: (input) => ({ valid: true, value: input as { ok: boolean } }),
    });

    expect(result.attempts).toBe(2);
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});
