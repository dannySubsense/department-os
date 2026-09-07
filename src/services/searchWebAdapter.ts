import Anthropic from '@anthropic-ai/sdk';
import { getClient, MODEL } from './llmClient.js';
import type { SearchWebAdapterResult } from '../types/domain.js';

/** searchWeb adapter boundary (Architecture §1.6 item 1, binding). This is the ONLY place a
 *  provider's search-tool behavior is trusted for outcome classification — everything above this
 *  boundary consumes `SearchWebAdapterResult`'s `succeeded`/`query-limited` split, never a
 *  provider-SDK-specific error shape. DDR-0001 selected Anthropic's built-in `web_search` server
 *  tool (row 9) as the search provider for this milestone's runtime; this adapter wraps that
 *  specific call, so a future provider swap touches only this file. */
/** Ruled an engineering default, 2026-09-06 (DDR-0002 closure addendum) — no further sourcing
 *  needed. The silent-discard risk this cap posed (a capped `web_search` response could drop real
 *  result URLs before they became evidence) is closed by the `stop_reason === 'max_tokens'`
 *  handling below, which folds a capped response into `queryLimitation` rather than reporting it
 *  as clean success — see `docs/decisions/DDR-0002-constant-integrity-no-fourth-option.md`,
 *  Addendum. */
const MAX_SEARCH_OUTPUT_TOKENS = 1024;

/** Unsourced — no mathematical, scientific, or programmatic precedent has been shown for 5
 *  specifically. This value must not be treated as accepted: it has no named owner because
 *  nobody has reviewed real evidence for it, and "PROVISIONAL, owner: [name]" is not a
 *  substitute for that evidence — a label is not a citation. Per DDR-0002
 *  (`docs/decisions/DDR-0002-constant-integrity-no-fourth-option.md`) this constant is tracked
 *  in `PROGRESS.md` pending real grounding before it can be either cited or replaced. */
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

  // A response capped by MAX_SEARCH_OUTPUT_TOKENS mid-generation (stop_reason: 'max_tokens') can
  // leave a partial, or even zero, set of `web_search_tool_result` blocks — indistinguishable from
  // a genuinely complete, small result set unless this is checked explicitly. Never report a
  // capped search as clean, unqualified 'succeeded' (this org's postmortem: a byte/token cap
  // silently truncating the thing a pipeline exists to read, with no downstream signal).
  const wasTruncated = response.stop_reason === 'max_tokens';

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
          reason: `response truncated at the ${MAX_SEARCH_OUTPUT_TOKENS}-token output cap before any web_search_tool_result block could be produced (stop_reason: max_tokens)`,
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
    // At least one web_search_tool_result block WAS produced, but the response as a whole was cut
    // off at the MAX_SEARCH_OUTPUT_TOKENS cap — later blocks (and possibly items within the last
    // captured block) may be missing. Never let a capped-but-nonempty result set look like a
    // genuinely complete one.
    errorReasons.push(
      `response truncated at the ${MAX_SEARCH_OUTPUT_TOKENS}-token output cap (stop_reason: max_tokens) — result set may be incomplete`,
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
