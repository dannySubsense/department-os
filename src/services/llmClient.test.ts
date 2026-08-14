import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CapturedToolInvocation } from './provenanceContext.js';

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
const { withProvenanceCollector } = await import('./provenanceContext.js');

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

describe('callForcedTool — attemptHistory telemetry (Architecture §1.9 points 1/2)', () => {
  it('populates attemptHistory with exactly one entry, carrying rawOutput/valid/model/timing, on a first-attempt success', async () => {
    createMock.mockResolvedValueOnce(toolUseResponse({ ok: true }));

    const result = await callForcedTool({
      ...baseParams,
      validate: (input) => ({ valid: true, value: input as { ok: boolean } }),
    });

    expect(result.attemptHistory).toHaveLength(1);
    const attempt = result.attemptHistory![0];
    expect(attempt.attemptNumber).toBe(1);
    expect(attempt.valid).toBe(true);
    expect(JSON.parse(attempt.rawOutput)).toEqual({ ok: true });
    expect(attempt.modelIdentifier).toBeTruthy();
    expect(typeof attempt.startedAt).toBe('string');
    expect(typeof attempt.completedAt).toBe('string');
    // Exactly 1 underlying model call for a first-attempt success — no extra call introduced.
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('populates attemptHistory with exactly 2 entries (first invalid, repair valid) on the repair-succeeds path', async () => {
    createMock
      .mockResolvedValueOnce(toolUseResponse({ ok: 'not-a-boolean' }))
      .mockResolvedValueOnce(toolUseResponse({ ok: true }));

    const validate = (input: unknown) => {
      const v = input as { ok: unknown };
      return typeof v.ok === 'boolean'
        ? { valid: true as const, value: v as { ok: boolean } }
        : { valid: false as const, error: 'ok must be boolean' };
    };

    const result = await callForcedTool({ ...baseParams, validate });

    expect(result.attemptHistory).toHaveLength(2);
    expect(result.attemptHistory![0].attemptNumber).toBe(1);
    expect(result.attemptHistory![0].valid).toBe(false);
    expect(result.attemptHistory![0].validationError).toBe('ok must be boolean');
    expect(result.attemptHistory![1].attemptNumber).toBe(2);
    expect(result.attemptHistory![1].valid).toBe(true);
    // MAX_REPAIR_ATTEMPTS unchanged: still exactly 2 underlying model calls, not 3.
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('populates attemptHistory with exactly 2 entries (both invalid) on the repair-also-fails path, thrown as LlmValidationError.attemptHistory', async () => {
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
      expect(validationErr.attemptHistory).toHaveLength(2);
      expect(validationErr.attemptHistory[0].valid).toBe(false);
      expect(validationErr.attemptHistory[1].valid).toBe(false);
      // Existing fields keep their original meaning — no breaking change (Architecture §1.9 point 2).
      expect(validationErr.attempts).toBe(2);
      expect(validationErr.rawOutput).toEqual({ ok: 'bad-2' });
    }
    // Still exactly 2 underlying model calls — no 3rd call introduced by the telemetry addition.
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('calls recordToolInvocation with the correct tool name for each attempt when a provenance collector scope is open', async () => {
    createMock
      .mockResolvedValueOnce(toolUseResponse({ ok: 'not-a-boolean' }))
      .mockResolvedValueOnce(toolUseResponse({ ok: true }));

    const validate = (input: unknown) => {
      const v = input as { ok: unknown };
      return typeof v.ok === 'boolean'
        ? { valid: true as const, value: v as { ok: boolean } }
        : { valid: false as const, error: 'ok must be boolean' };
    };

    const captured: CapturedToolInvocation[] = [];
    const collector = { record: (inv: CapturedToolInvocation) => captured.push(inv) };

    await withProvenanceCollector(collector, () => callForcedTool({ ...baseParams, validate }));

    expect(captured).toHaveLength(2);
    expect(captured.every((inv) => inv.toolName === 'test_tool')).toBe(true);
    expect(captured[0].attemptNumber).toBe(1);
    expect(captured[0].valid).toBe(false);
    expect(captured[1].attemptNumber).toBe(2);
    expect(captured[1].valid).toBe(true);
  });
});
