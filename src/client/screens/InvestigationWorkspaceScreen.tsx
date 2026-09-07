import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchInvestigationWorkspace } from '../api.js';
import type { InvestigationWorkspaceView } from '../../types/readModels.js';
import { InvestigationIdentityHeader } from '../components/InvestigationIdentityHeader.js';
import { SourceListPanel } from '../components/SourceListPanel.js';
import { OpenEligiblePanel } from '../components/OutcomeStatusPanel/OpenEligiblePanel.js';
import { BlockedSourcesPanel } from '../components/OutcomeStatusPanel/BlockedSourcesPanel.js';

interface FetchState {
  workspace: InvestigationWorkspaceView | null;
  notFound: boolean;
  error: string | null;
}

/** Investigation Workspace — mount, fetch-on-mount, not-found and error states (US-1 AC4).
 *  Renders regions 1-2 only this slice (Header, Outcome/Status Panel: Open/Eligible and Blocked
 *  variants only) — `GenerationProgressPanel`/`ProvenanceRail`/`BriefReviewPanel` etc. are
 *  C2-S3/C2-S4's own scope. */
export function InvestigationWorkspaceScreen() {
  const { investigationId } = useParams<{ investigationId: string }>();
  const [state, setState] = useState<FetchState>({ workspace: null, notFound: false, error: null });

  const load = useCallback(() => {
    if (!investigationId) return;
    fetchInvestigationWorkspace(investigationId)
      .then((workspace) => {
        setState({ workspace, notFound: false, error: null });
      })
      .catch((err: Error) => {
        if (err.message.includes('status 404')) {
          setState({ workspace: null, notFound: true, error: null });
        } else {
          setState({ workspace: null, notFound: false, error: err.message });
        }
      });
  }, [investigationId]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.notFound) {
    return (
      <div className="screen">
        <div className="page-not-found" role="status">
          Investigation not found.
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="screen">
        <div className="page-error" role="alert">
          Failed to load Investigation workspace: {state.error}
        </div>
      </div>
    );
  }

  if (!state.workspace) {
    return (
      <div className="screen">
        <div className="page-loading" role="status">
          Loading Investigation workspace…
        </div>
      </div>
    );
  }

  const workspace = state.workspace;

  return (
    <div className="screen investigation-workspace-screen">
      <InvestigationIdentityHeader investigation={workspace.investigation} />
      <SourceListPanel sources={workspace.investigation.sources} />
      {workspace.investigation.status === 'blocked' ? (
        <BlockedSourcesPanel
          investigationId={workspace.investigation.id}
          sources={workspace.investigation.sources}
          onWorkspaceChanged={load}
        />
      ) : (
        <OpenEligiblePanel workspace={workspace} />
      )}
    </div>
  );
}
