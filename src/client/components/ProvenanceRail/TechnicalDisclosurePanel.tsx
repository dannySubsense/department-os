import { useState } from 'react';
import type { WorkspaceGenerationRunSummary } from '../../../types/readModels.js';

interface TechnicalDisclosurePanelProps {
  generationRuns: WorkspaceGenerationRunSummary[];
}

/** The one permitted exception to "uncollapsed by default" — raw validation/runtime detail
 *  (`SchemaValidationRecord.attempts`' `rawOutput`/`validationError`/`tokenUsage`, per-attempt
 *  timing) behind a real expand control, starting collapsed. */
export function TechnicalDisclosurePanel({ generationRuns }: TechnicalDisclosurePanelProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="provenance-rail__technical-disclosure-panel" aria-label="Technical disclosure">
      <button type="button" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
        {expanded ? 'Hide' : 'Show'} technical disclosure
      </button>
      {expanded ? (
        <pre className="provenance-rail__technical-disclosure-raw">
          {JSON.stringify(generationRuns, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}
