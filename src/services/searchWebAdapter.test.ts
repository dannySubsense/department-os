import { beforeEach, describe, expect, it, vi } from 'vitest';

/** searchWeb adapter boundary coverage (Architecture §1.6 item 1, binding): provider-level
 *  failures — whether a thrown SDK error or a `web_search_tool_result_error` content block — must
 *  produce `outcome: 'query-limited'` with a `QueryLimitation`, never a thrown error propagated to
 *  the caller. Mocks the Anthropic SDK one layer down, same technique as llmClient.test.ts. */
const createMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: createMock };
    },
  };
});

const { searchWebAdapter } = await import('./searchWebAdapter.js');

beforeEach(() => {
  createMock.mockReset();
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

describe('searchWebAdapter — success path', () => {
  it('returns outcome "succeeded" with selectedResultUrls when the provider returns a web_search_tool_result array', async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: 'web_search_tool_result',
          tool_use_id: 'toolu_1',
          content: [
            { type: 'web_search_result', url: 'https://example.com/a', title: 'A', page_age: null },
            { type: 'web_search_result', url: 'https://example.com/b', title: 'B', page_age: null },
          ],
        },
      ],
      stop_reason: 'end_turn',
    });

    const result = await searchWebAdapter('test query');

    expect(result.outcome).toBe('succeeded');
    expect(result.query).toBe('test query');
    expect(result.selectedResultUrls).toEqual(['https://example.com/a', 'https://example.com/b']);
    expect(result.queryLimitation).toBeUndefined();
  });

  it('returns outcome "succeeded" with an empty selectedResultUrls (legitimate zero-results) when no web_search_tool_result block is present', async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'nothing to search for' }],
      stop_reason: 'end_turn',
    });

    const result = await searchWebAdapter('empty query');

    expect(result.outcome).toBe('succeeded');
    expect(result.selectedResultUrls).toEqual([]);
    expect(result.queryLimitation).toBeUndefined();
  });
});

describe('searchWebAdapter — provider-level failure shapes → outcome: "query-limited"', () => {
  it('produces outcome "query-limited" with a QueryLimitation when the SDK call throws, rather than propagating the thrown error', async () => {
    createMock.mockRejectedValueOnce(new Error('429 rate limited'));

    const result = await searchWebAdapter('failing query');

    expect(result.outcome).toBe('query-limited');
    expect(result.selectedResultUrls).toEqual([]);
    expect(result.queryLimitation).toBeDefined();
    expect(result.queryLimitation?.reason).toMatch(/429 rate limited/);
  });

  it('produces outcome "query-limited" with a QueryLimitation when the response contains a web_search_tool_result_error content block, rather than throwing', async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: 'web_search_tool_result',
          tool_use_id: 'toolu_2',
          content: {
            type: 'web_search_tool_result_error',
            error_code: 'unavailable',
          },
        },
      ],
      stop_reason: 'end_turn',
    });

    const result = await searchWebAdapter('errored query');

    expect(result.outcome).toBe('query-limited');
    expect(result.selectedResultUrls).toEqual([]);
    expect(result.queryLimitation).toBeDefined();
    expect(result.queryLimitation?.reason).toMatch(/unavailable/);
  });

  it('never throws for either provider-level failure shape', async () => {
    createMock.mockRejectedValueOnce(new Error('auth failure'));
    await expect(searchWebAdapter('q1')).resolves.toBeDefined();

    createMock.mockResolvedValueOnce({
      content: [
        {
          type: 'web_search_tool_result',
          tool_use_id: 'toolu_3',
          content: { type: 'web_search_tool_result_error', error_code: 'query_too_long' },
        },
      ],
      stop_reason: 'end_turn',
    });
    await expect(searchWebAdapter('q2')).resolves.toBeDefined();
  });

  it('produces outcome "query-limited" without throwing when the SDK resolves with a null/undefined response', async () => {
    createMock.mockResolvedValueOnce(null);

    const result = await searchWebAdapter('null response query');

    expect(result.outcome).toBe('query-limited');
    expect(result.selectedResultUrls).toEqual([]);
    expect(result.queryLimitation).toBeDefined();
  });

  it('drops a null/undefined item in a web_search_tool_result content array rather than throwing, and never emits null into selectedResultUrls', async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: 'web_search_tool_result',
          tool_use_id: 'toolu_4',
          content: [
            { type: 'web_search_result', url: 'https://example.com/ok', title: 'OK', page_age: null },
            null,
          ],
        },
      ],
      stop_reason: 'end_turn',
    });

    const result = await searchWebAdapter('null item query');

    expect(result.outcome).toBe('succeeded');
    expect(result.selectedResultUrls).toEqual(['https://example.com/ok']);
    expect(result.selectedResultUrls.every((u) => typeof u === 'string')).toBe(true);
    expect(result.queryLimitation).toBeDefined();
    expect(result.queryLimitation?.reason).toMatch(/dropped 1 malformed result item/);
  });

  it('drops a result item missing its url field rather than emitting null into selectedResultUrls', async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: 'web_search_tool_result',
          tool_use_id: 'toolu_5',
          content: [
            { type: 'web_search_result', title: 'No URL', page_age: null },
            { type: 'web_search_result', url: 'https://example.com/valid', title: 'Valid', page_age: null },
          ],
        },
      ],
      stop_reason: 'end_turn',
    });

    const result = await searchWebAdapter('missing url query');

    expect(result.outcome).toBe('succeeded');
    expect(result.selectedResultUrls).toEqual(['https://example.com/valid']);
    expect(result.selectedResultUrls).not.toContain(null);
    expect(result.queryLimitation?.reason).toMatch(/dropped 1 malformed result item/);
  });

  it('reports a response truncated at the max_tokens cap as a limitation, not a clean unqualified "succeeded" (Frank spec-gate FAIL, 2026-09-05 — silent-truncation defect)', async () => {
    createMock.mockResolvedValueOnce({
      content: [],
      stop_reason: 'max_tokens',
    });

    const result = await searchWebAdapter('truncated query');

    expect(result.outcome).toBe('query-limited');
    expect(result.selectedResultUrls).toEqual([]);
    expect(result.queryLimitation).toBeDefined();
    expect(result.queryLimitation?.reason).toMatch(/max_tokens/i);
  });

  it('folds truncation into queryLimitation even when a partial result set survived the max_tokens cap, never reporting it as clean unqualified "succeeded"', async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: 'web_search_tool_result',
          tool_use_id: 'toolu_6',
          content: [
            { type: 'web_search_result', url: 'https://example.com/partial', title: 'Partial', page_age: null },
          ],
        },
      ],
      stop_reason: 'max_tokens',
    });

    const result = await searchWebAdapter('partially truncated query');

    expect(result.outcome).toBe('succeeded');
    expect(result.selectedResultUrls).toEqual(['https://example.com/partial']);
    expect(result.queryLimitation).toBeDefined();
    expect(result.queryLimitation?.reason).toMatch(/max_tokens/i);
  });

  it('reports a pause_turn response with zero result blocks as a limitation, not a clean unqualified "succeeded" (Cold Frank gate FAIL, commit 9f3e150 — blacklist-of-one defect)', async () => {
    createMock.mockResolvedValueOnce({
      content: [],
      stop_reason: 'pause_turn',
    });

    const result = await searchWebAdapter('pause_turn query');

    expect(result.outcome).toBe('query-limited');
    expect(result.selectedResultUrls).toEqual([]);
    expect(result.queryLimitation).toBeDefined();
    expect(result.queryLimitation?.reason).toMatch(/pause_turn/i);
  });

  it('folds a non-max_tokens incomplete stop_reason (pause_turn) into queryLimitation even when a partial result set survived, never reporting it as clean unqualified "succeeded"', async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: 'web_search_tool_result',
          tool_use_id: 'toolu_7',
          content: [
            { type: 'web_search_result', url: 'https://example.com/pause', title: 'Pause', page_age: null },
          ],
        },
      ],
      stop_reason: 'pause_turn',
    });

    const result = await searchWebAdapter('partially paused query');

    expect(result.outcome).toBe('succeeded');
    expect(result.selectedResultUrls).toEqual(['https://example.com/pause']);
    expect(result.queryLimitation).toBeDefined();
    expect(result.queryLimitation?.reason).toMatch(/pause_turn/i);
  });

  it('reports a tool_use stop_reason with zero result blocks as a limitation, not a clean unqualified "succeeded" — this call declares only the server tool web_search, so a tool_use stop_reason here is not a resolved-before-returning success, unlike a forced-client-tool call site', async () => {
    createMock.mockResolvedValueOnce({
      content: [],
      stop_reason: 'tool_use',
    });

    const result = await searchWebAdapter('tool_use zero-blocks query');

    expect(result.outcome).toBe('query-limited');
    expect(result.selectedResultUrls).toEqual([]);
    expect(result.queryLimitation).toBeDefined();
    expect(result.queryLimitation?.reason).toMatch(/tool_use/i);
  });
});
