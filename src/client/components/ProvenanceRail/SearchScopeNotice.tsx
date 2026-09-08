import type { WorkspaceGenerationRunSummary } from '../../../types/readModels.js';

interface SearchScopeNoticeProps {
  producingRun: WorkspaceGenerationRunSummary | undefined; // the DISPLAYED version's own
  // producing GenerationRun (workspace.generationRuns.find(r => r.id === brief.version.generationRunId))
  // — never a later run's searches conflated with an older version's evidence
}

/** Scoped to the DISPLAYED version's own producing run — a reader viewing an old Brief version
 *  must see the search scope that actually produced THAT version's evidence, never a later run's
 *  searches (US-1 AC5, §5.3 "Navigate to a Specific Brief Version"). Renders queries performed and
 *  any failed/blocked retrievals; always renders, even for zero queries. */
export function SearchScopeNotice({ producingRun }: SearchScopeNoticeProps) {
  const queries = producingRun?.webSearchQueries ?? [];
  return (
    <section className="provenance-rail__search-scope-notice" aria-label="Search scope">
      <h4>Search Scope</h4>
      {queries.length === 0 ? (
        <p>No web searches were performed for this Brief version.</p>
      ) : (
        <ul>
          {queries.map((q) => (
            <li key={q.id}>
              <p className="provenance-rail__search-query">{q.query}</p>
              {q.scopeNote ? <p>{q.scopeNote}</p> : null}
              {q.limitations.length > 0 ? (
                <ul className="provenance-rail__search-limitations">
                  {q.limitations.map((limitation, i) => (
                    <li key={i}>{limitation}</li>
                  ))}
                </ul>
              ) : null}
              <ul className="provenance-rail__search-results">
                {q.results.map((r) => (
                  <li key={r.url} className={`provenance-rail__search-result provenance-rail__search-result--${r.status}`}>
                    <span className="data-value">{r.url}</span> —{' '}
                    <span className="data-value">{r.status}</span>
                    {r.failureReason ? ` — ${r.failureReason}` : ''}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
