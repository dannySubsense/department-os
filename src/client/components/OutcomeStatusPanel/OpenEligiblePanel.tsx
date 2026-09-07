import type { InvestigationWorkspaceView } from '../../../types/readModels.js';

interface OpenEligiblePanelProps {
  workspace: InvestigationWorkspaceView;
}

/** Identity/eligibility fact display only (02-ARCHITECTURE.md §5.3) — `GenerateButton` itself is
 *  built and wired in C2-S3, which owns this file's completion. */
export function OpenEligiblePanel({ workspace }: OpenEligiblePanelProps) {
  return (
    <section className="outcome-status-panel outcome-status-panel--open" aria-label="Status: Open">
      <h2 className="outcome-status-panel__title">Open</h2>
      <p className="outcome-status-panel__body">
        This Investigation is accepting submissions and has no Brief yet.
      </p>
      <p className="data-value outcome-status-panel__eligibility">
        Generation eligible: {workspace.generationEligible ? 'yes' : 'no'}
      </p>
    </section>
  );
}
