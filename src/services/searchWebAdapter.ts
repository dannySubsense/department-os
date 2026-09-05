import Anthropic from '@anthropic-ai/sdk';
import { getClient, MODEL } from './llmClient.js';
import type { SearchWebAdapterResult } from '../types/domain.js';

/** searchWeb adapter boundary (Architecture §1.6 item 1, binding). This is the ONLY place a
 *  provider's search-tool behavior is trusted for outcome classification — everything above this
 *  boundary consumes `SearchWebAdapterResult`'s `succeeded`/`query-limited` split, never a
 *  provider-SDK-specific error shape. DDR-0001 selected Anthropic's built-in `web_search` server
 *  tool (row 9) as the search provider for this milestone's runtime; this adapter wraps that
 *  specific call, so a future provider swap touches only this file. */
/** Unsourced — no mathematical, scientific, or programmatic precedent has been shown for 1024
 *  specifically. Classified Category B (infrastructure/operational safety limit) under DDR-0002
 *  (`docs/decisions/DDR-0002-constant-integrity-no-fourth-option.md`, B1): a search-output token
 *  budget, not a correctness or evidence-quality gate, so it does not require branch (a)/(b)
 *  sourcing or ownership. No grounding is pending. Revisit only on an observed operational
 *  incident, not on a scheduled measurement. */
const MAX_SEARCH_OUTPUT_TOKENS = 1024;

/** Unsourced — no mathematical, scientific, or programmatic precedent has been shown for 5
 *  specifically. Classified Category B (infrastructure/operational safety limit) under DDR-0002
 *  (`docs/decisions/DDR-0002-constant-integrity-no-fourth-option.md`, B2): a per-turn search
 *  budget, not a correctness or evidence-quality gate, so it does not require branch (a)/(b)
 *  sourcing or ownership. No grounding is pending. Revisit only on an observed operational
 *  incident (e.g. search budget exhausted mid-investigation), not on a scheduled measurement. */
const MAX_SEARCHES_PER_TURN = 5;

export async function searchWebAdapter(query: string): Promise<SearchWebAdapterResult> {
  const performedAt = new Date().toISOString();

  let response: Anthropic.Message;
  try {
    const anthropic = getClient();
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_SEARCH_OUTPUT_TOKENS,
      messages: [
        {
          role: 'user',
          content: `Search the web for: ${query}`,
        },
      ],
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: MAX_SEARCHES_PER_TURN,
        },
      ],
    });
  } catch (err) {
    // Provider-level call failure (network error, auth/quota failure, rate limit, malformed
    // request) — the search call itself never produced a result set. Query limitation, not a
    // thrown error propagated to the caller (Architecture §1.6 item 1, binding).
    return {
      outcome: 'query-limited',
      query,
      performedAt,
      selectedResultUrls: [],
      queryLimitation: {
        id: '', // assigned on persistence
        webSearchQueryId: '', // assigned on persistence
        reason: `provider error: ${err instanceof Error ? err.message : 'unknown error'}`,
        occurredAt: new Date().toISOString(),
      },
    };
  }

  // Guard every access into response.content — an unexpected/malformed response shape (missing
  // content, content not an array, response itself null/undefined, etc.) must produce a
  // query-limited outcome, never a thrown TypeError escaping this "never throws" boundary
  // (Architecture §1.6 item 1, binding).
  if (!response || !Array.isArray(response.content)) {
    return {
      outcome: 'query-limited',
      query,
      performedAt,
      selectedResultUrls: [],
      queryLimitation: {
        id: '',
        webSearchQueryId: '',
        reason: 'malformed provider response: content is not an array',
        occurredAt: new Date().toISOString(),
      },
    };
  }

  // The `web_search` tool allows up to MAX_SEARCHES_PER_TURN searches per turn, so the response
  // can contain MULTIPLE `web_search_tool_result` blocks — one per search performed. Iterate over
  // ALL of them; reading only the first silently discards URLs and limitation info from later
  // blocks.
  const resultBlocks = response.content.filter(
    (block): block is Anthropic.WebSearchToolResultBlock =>
      block?.type === 'web_search_tool_result',
  );

  // `web_search` is a SERVER tool: the API executes it automatically mid-turn and the model's own
  // turn continues past it, so a genuinely complete response to a server-tool-only call (this call
  // declares no client tools) ends with `end_turn`. This is a whitelist, not a blacklist of one
  // value: the full `StopReason` union (SDK verified against
  // `node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts` lines 722-738) is
  // `'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'pause_turn' | 'refusal' |
  // 'model_context_window_exceeded'`. The SDK's own doc comment defines `'tool_use'` as "the model
  // invoked one or more tools" — for a CLIENT tool that is the normal signal that the caller must
  // now execute the tool, but this call declares only the server tool `web_search`, so a `tool_use`
  // stop_reason here is not the server-tool-resolved-before-returning case: it indicates the
  // response ended without the server having completed and returned its normal post-tool turn, so
  // it is treated as incomplete, the same as `pause_turn`. `pause_turn` is the SDK's own
  // incomplete-turn signal for long-running server tools like `web_search` — a `pause_turn`
  // response with zero result blocks is a query limitation, not a legitimate zero-results success,
  // for the same reason `max_tokens` is (this org's postmortem: a byte/token cap silently
  // truncating the thing a pipeline exists to read, with no downstream signal).
  const isCompleteStopReason = response.stop_reason === 'end_turn';
  const wasTruncated = !isCompleteStopReason;

  if (resultBlocks.length === 0) {
    if (wasTruncated) {
      return {
        outcome: 'query-limited',
        query,
        performedAt,
        selectedResultUrls: [],
        queryLimitation: {
          id: '',
          webSearchQueryId: '',
          reason: `response ended before any web_search_tool_result block could be produced (stop_reason: ${response.stop_reason})`,
          occurredAt: new Date().toISOString(),
        },
      };
    }
    // The model chose not to search (e.g. it had nothing to search for), or produced no
    // search-tool-result block at all — a legitimate zero-results outcome, not a provider
    // failure: the call itself succeeded, it simply selected zero URLs.
    return { outcome: 'succeeded', query, performedAt, selectedResultUrls: [] };
  }

  const selectedResultUrls: string[] = [];
  const errorReasons: string[] = [];
  let droppedItemCount = 0;

  for (const block of resultBlocks) {
    if (Array.isArray(block.content)) {
      // Guard every item in the block's content array — a null/undefined item, or an item
      // missing a valid non-empty string `url`, is dropped rather than reaching
      // `selectedResultUrls` (never emit a non-string into the string[] contract) or crashing
      // (Architecture §1.6 item 1, binding; "never silently discard" — droppedItemCount below).
      for (const item of block.content) {
        if (item && typeof item.url === 'string' && item.url.length > 0) {
          selectedResultUrls.push(item.url);
        } else {
          droppedItemCount += 1;
        }
      }
    } else if (block.content && typeof block.content === 'object' && 'error_code' in block.content) {
      // block.content is a WebSearchToolResultError — this individual search failed at the
      // provider boundary (rate limited, invalid input, unavailable, etc.).
      errorReasons.push(`provider error: ${block.content.error_code}`);
    } else {
      errorReasons.push('malformed web_search_tool_result block');
    }
  }

  if (droppedItemCount > 0) {
    // Malformed/urlless result items were dropped from an otherwise-valid block — never silently
    // discard: fold the drop count into the limitation reason so it is visible on the record.
    errorReasons.push(
      `dropped ${droppedItemCount} malformed result item${droppedItemCount === 1 ? '' : 's'} (missing/invalid url)`,
    );
  }

  if (wasTruncated) {
    // At least one web_search_tool_result block WAS produced, but the response as a whole did not
    // end on a complete stop reason (`end_turn`) — later blocks (and possibly items
    // within the last captured block) may be missing. Never let a capped-but-nonempty result set
    // look like a genuinely complete one.
    errorReasons.push(
      `response did not end on a complete stop reason (stop_reason: ${response.stop_reason}) — result set may be incomplete`,
    );
  }

  if (errorReasons.length === 0) {
    // Every block succeeded — fully clean success, no queryLimitation.
    return { outcome: 'succeeded', query, performedAt, selectedResultUrls };
  }

  const queryLimitation = {
    id: '',
    webSearchQueryId: '',
    reason: errorReasons.join('; '),
    occurredAt: new Date().toISOString(),
  };

  if (selectedResultUrls.length === 0) {
    // Every block errored — no result set was ever produced, the search call as a whole failed.
    return { outcome: 'query-limited', query, performedAt, selectedResultUrls: [], queryLimitation };
  }

  // Partial outcome: some blocks succeeded (URLs collected) while at least one other block
  // errored. Partial success must never look like clean success (Q-6 AC5) — outcome stays
  // 'succeeded' since a real, non-empty result set WAS produced, but queryLimitation is populated
  // so the limitation is never silently dropped.
  return { outcome: 'succeeded', query, performedAt, selectedResultUrls, queryLimitation };
}
