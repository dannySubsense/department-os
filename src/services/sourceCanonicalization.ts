/** Shared URL normalization for new URL resolutions (02-ARCHITECTURE.md §4.8 SOL-MEDIUM-1 fix).
 *  Canonical URL is provenance/matching context, while duplicate/attempted snapshot identity is
 *  the content hash (`resolved_content_hash`) — this module never computes that hash, only the
 *  normalized URL string.
 *
 *  Normalization applied: lowercase scheme/host, strip a trailing slash from an otherwise-empty
 *  path, and strip common tracking query parameters — never invents or reconstructs a URL that
 *  was not actually the fetch's own final destination (`FetchResult.finalUrl`, §4.6a). */

const TRACKING_PARAM_PREFIXES = ['utm_'];
const TRACKING_PARAM_NAMES = new Set(['gclid', 'fbclid', 'mc_cid', 'mc_eid', 'ref', 'igshid']);

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    TRACKING_PARAM_NAMES.has(lower) || TRACKING_PARAM_PREFIXES.some((p) => lower.startsWith(p))
  );
}

/** Normalizes a final, post-redirect URL (never the originally-submitted one) into a canonical
 *  form: lowercase scheme + host, trailing-slash-only path collapsed to `/`, tracking query
 *  parameters stripped, fragment removed. Returns `null` if `rawFinalUrl` does not parse as a
 *  URL — this should not happen in practice since `finalUrl` is always produced from a
 *  successfully-parsed `URL` object by `fetchWithGuards`, but this function does not assume that
 *  invariant holds for every future caller. */
export function canonicalizeUrl(rawFinalUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawFinalUrl);
  } catch {
    return null;
  }

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = '';

  const params = Array.from(url.searchParams.entries());
  url.search = '';
  for (const [key, value] of params) {
    if (!isTrackingParam(key)) {
      url.searchParams.append(key, value);
    }
  }

  if (url.pathname === '') {
    url.pathname = '/';
  } else if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  }

  return url.toString();
}
