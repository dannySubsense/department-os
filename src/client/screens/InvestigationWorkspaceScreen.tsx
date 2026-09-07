import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchInvestigationWorkspace } from '../api.js';
import type { InvestigationWorkspaceView } from '../../types/readModels.js';
import { InvestigationIdentityHeader } from '../components/InvestigationIdentityHeader.js';
import { SourceListPanel } from '../components/SourceListPanel.js';
import { OpenEligiblePanel } from '../components/OutcomeStatusPanel/OpenEligiblePanel.js';
import { BlockedSourcesPanel } from '../components/OutcomeStatusPanel/BlockedSourcesPanel.js';
import { GenerationProgressPanel } from '../components/OutcomeStatusPanel/GenerationProgressPanel.js';
import { GenerationFailedPanel } from '../components/OutcomeStatusPanel/GenerationFailedPanel.js';

interface FetchState {
  workspace: InvestigationWorkspaceView | null;
  notFound: boolean;
  error: string | null;
}

// ---- §4.9/§5.2 POLL_INTERVAL_MS — engineering-owned, derived this slice.
//
// MEASURED (real, this slice, 2026-09-07, corrected — supersedes an earlier 20x `SELECT 1`
// proxy measurement that never called the real endpoint): 20 direct in-process calls to the real
// `getInvestigationWorkspace` service function (the same function the real `GET
// /api/investigations/:id/workspace` route calls, §4.4) against this project's own dev Postgres
// instance (localhost:55432), targeting a real, pre-existing investigation row (7 real queries
// per call — investigation, sources, generation_run, generation_step, web_search_query/result/
// limitation, joins + jsonb decode included): min 2ms, p50 3ms, p95 5ms, max 12ms (single
// outlier, no cold-connection-setup artifact — the pool was already warm for calls 2-20).
//
// CONCURRENCY ASSUMPTION (stated explicitly, not folded into the measured number above): this
// single-process design (Out of Scope: no queue/worker fan-out) realistically serves a handful of
// simultaneously-open workspace tabs — assumed here as up to ~10 concurrent pollers, not measured.
//
// DERIVATION: POLL_INTERVAL_MS = 2000 (2s). At the measured real per-poll endpoint cost (p95 5ms,
// worst observed 12ms) and the assumed concurrency above, even 10 simultaneous pollers at this
// interval impose well under 1% duty cycle on the DB — polling every 2 seconds is essentially free
// at this measured cost, so the interval is set by "reads as actively progressing to an operator
// watching the screen," not by endpoint load. If real measured concurrency later shows this needs
// revision, only this constant changes — no other mechanism in this file depends on its specific
// magnitude.
const POLL_INTERVAL_MS = 2000;

/** Investigation Workspace — mount, fetch-on-mount, not-found/error states (US-1 AC4), honest
 *  in-progress polling and stale/interrupted disclosure (US-4), Generation-Failed retry (US-6),
 *  Blocked recovery (US-5/US-8). `ProvenanceRail`/`BriefReviewPanel` etc. are C2-S4's own scope. */
export function InvestigationWorkspaceScreen() {
  const { investigationId } = useParams<{ investigationId: string }>();
  const [state, setState] = useState<FetchState>({ workspace: null, notFound: false, error: null });
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Polling (US-4 AC2, §5.2) — keyed on livenessState === 'active', NOT the bare
  // outcome === 'in-progress' check, so a stale/interrupted run does not poll forever. Clears on
  // transition to 'terminal' OR 'stale-or-interrupted'.
  const livenessState = state.workspace?.latestGenerationRun?.livenessState;
  useEffect(() => {
    if (livenessState === 'active') {
      pollIntervalRef.current = setInterval(load, POLL_INTERVAL_MS);
      return () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      };
    }
    return undefined;
  }, [livenessState, load]);

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
  const run = workspace.latestGenerationRun;

  // §5.4 rule 1 — GenerationProgressPanel/its controls mount only when no BriefVersion exists yet
  // or the displayed version is current. This slice never displays a prior version (C2-S4's own
  // scope), so `briefs.length === 0` disjunct is what actually gates this today.
  const showProgressPanel =
    run !== null && run.outcome === 'in-progress' && workspace.briefs.length === 0;

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
      ) : workspace.investigation.status === 'generation-failed' ? (
        <GenerationFailedPanel workspace={workspace} onWorkspaceChanged={load} />
      ) : (
        <OpenEligiblePanel workspace={workspace} onWorkspaceChanged={load} />
      )}
      {showProgressPanel && run ? (
        <GenerationProgressPanel
          investigationId={workspace.investigation.id}
          generationRun={run}
          onWorkspaceChanged={load}
        />
      ) : null}
    </div>
  );
}
