import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  fetchInvestigationWorkspace,
  fetchBriefForReviewByVersionNumber,
  FetchBriefForReviewApiError,
  submitDecision,
  SubmitDecisionApiError,
} from '../api.js';
import type { InvestigationWorkspaceView } from '../../types/readModels.js';
import type { GetBriefForReviewResult } from '../../services/getBriefForReview.js';
import { InvestigationIdentityHeader } from '../components/InvestigationIdentityHeader.js';
import { SourceListPanel } from '../components/SourceListPanel.js';
import { OpenEligiblePanel } from '../components/OutcomeStatusPanel/OpenEligiblePanel.js';
import { BlockedSourcesPanel } from '../components/OutcomeStatusPanel/BlockedSourcesPanel.js';
import { GenerationProgressPanel } from '../components/OutcomeStatusPanel/GenerationProgressPanel.js';
import { GenerationFailedPanel } from '../components/OutcomeStatusPanel/GenerationFailedPanel.js';
import { BriefGeneratedSummaryPanel } from '../components/OutcomeStatusPanel/BriefGeneratedSummaryPanel.js';
import { ViewingPriorVersionPanel } from '../components/OutcomeStatusPanel/ViewingPriorVersionPanel.js';
import { BriefReviewPanel } from '../components/BriefReviewPanel/index.js';
import { ProvenanceRail } from '../components/ProvenanceRail/index.js';
import { DecisionForm, type DecisionFormSubmission } from '../components/DecisionSection/DecisionForm.js';
import { DecisionConfirmationPanel } from '../components/DecisionSection/DecisionConfirmationPanel.js';
import { DecisionHistoryBanner } from '../components/DecisionSection/DecisionHistoryBanner.js';

interface FetchState {
  workspace: InvestigationWorkspaceView | null;
  notFound: boolean;
  error: string | null;
}

interface BriefFetchState {
  brief: GetBriefForReviewResult | null;
  briefVersionNotFound: boolean;
}

interface DecisionSubmissionState {
  pending: boolean;
  error: string | null;
  confirmedDecisionId: string | null;
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
 *  Blocked recovery (US-5/US-8). C2-S4: Brief Review (region 3), Provenance Rail (region 4),
 *  version-numbered navigation (US-1 AC5), and the full §5.4 Outcome/Status Panel precedence
 *  order. */
export function InvestigationWorkspaceScreen() {
  const { investigationId, versionNumber: routedVersionNumberRaw } = useParams<{
    investigationId: string;
    versionNumber?: string;
  }>();
  const routedVersionNumber = routedVersionNumberRaw ? Number(routedVersionNumberRaw) : undefined;

  const [state, setState] = useState<FetchState>({ workspace: null, notFound: false, error: null });
  const [briefState, setBriefState] = useState<BriefFetchState>({
    brief: null,
    briefVersionNotFound: false,
  });
  const [decisionSubmission, setDecisionSubmission] = useState<DecisionSubmissionState>({
    pending: false,
    error: null,
    confirmedDecisionId: null,
  });
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

  // Brief content is fetched once per displayed version: the routed :versionNumber when present,
  // or workspace.briefs' isCurrent entry's own versionNumber when absent (§5.2) — not embedded in
  // InvestigationWorkspaceView, so it is not re-fetched on every poll tick.
  const workspace = state.workspace;
  const targetVersionNumber =
    routedVersionNumber ?? workspace?.briefs.find((b) => b.isCurrent)?.versionNumber;

  const loadBrief = useCallback(() => {
    if (!investigationId || targetVersionNumber === undefined) {
      setBriefState({ brief: null, briefVersionNotFound: false });
      return;
    }
    fetchBriefForReviewByVersionNumber(investigationId, targetVersionNumber)
      .then((brief) => {
        setBriefState({ brief, briefVersionNotFound: false });
      })
      .catch((err) => {
        if (err instanceof FetchBriefForReviewApiError && err.code === 'brief-version-not-found') {
          setBriefState({ brief: null, briefVersionNotFound: true });
        } else {
          setBriefState({ brief: null, briefVersionNotFound: false });
        }
      });
  }, [investigationId, targetVersionNumber]);

  useEffect(() => {
    loadBrief();
  }, [loadBrief]);

  // SOL-MEDIUM-4 fix — exact refetch mechanism (03-UI-SPEC.md "SOL-MEDIUM-4 fix"): on the 201
  // decision-submit response, issue BOTH a real GET.../workspace refetch (updates
  // decisionLineage) AND a real GET.../brief-versions/by-version/:versionNumber refetch for the
  // exact versionNumber currently on screen (updates priorDecisions), synchronously from this
  // handler, before either list re-renders — never a client-side optimistic append.
  const handleDecisionSubmit = useCallback(
    async (submission: DecisionFormSubmission) => {
      if (!investigationId || !briefState.brief) return;
      const briefVersionId = briefState.brief.version.id;
      setDecisionSubmission({ pending: true, error: null, confirmedDecisionId: null });
      try {
        const decision = await submitDecision(briefVersionId, submission);
        const [refreshedWorkspace, refreshedBrief] = await Promise.all([
          fetchInvestigationWorkspace(investigationId),
          targetVersionNumber !== undefined
            ? fetchBriefForReviewByVersionNumber(investigationId, targetVersionNumber)
            : Promise.resolve(null),
        ]);
        setState({ workspace: refreshedWorkspace, notFound: false, error: null });
        if (refreshedBrief) {
          setBriefState({ brief: refreshedBrief, briefVersionNotFound: false });
        }
        setDecisionSubmission({ pending: false, error: null, confirmedDecisionId: decision.id });
      } catch (err) {
        let message = (err as Error).message;
        if (err instanceof SubmitDecisionApiError) {
          if (err.code === 'watch-requires-condition') {
            message = 'Watch requires at least one named reconsideration condition.';
          } else if (err.code === 'brief-version-not-found') {
            message = 'This Brief version could not be found. Reload the workspace and try again.';
          } else if (err.code === 'invalid-request') {
            message = 'This decision could not be submitted.';
          }
        }
        setDecisionSubmission({ pending: false, error: message, confirmedDecisionId: null });
      }
    },
    [investigationId, briefState.brief, targetVersionNumber],
  );

  // Polling (US-4 AC2, §5.2) — keyed on livenessState === 'active', NOT the bare
  // outcome === 'in-progress' check, so a stale/interrupted run does not poll forever. Clears on
  // transition to 'terminal' OR 'stale-or-interrupted'.
  const livenessState = workspace?.latestGenerationRun?.livenessState;
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

  if (!workspace) {
    return (
      <div className="screen">
        <div className="page-loading" role="status">
          Loading Investigation workspace…
        </div>
      </div>
    );
  }

  const run = workspace.latestGenerationRun;
  const displayedSummary = routedVersionNumber
    ? workspace.briefs.find((b) => b.versionNumber === routedVersionNumber)
    : workspace.briefs.find((b) => b.isCurrent);
  // "Current" is vacuously true when workspace.briefs.length === 0 (§5.4) — there is nothing to
  // be non-current when no BriefVersion exists yet.
  const displayedIsCurrent = workspace.briefs.length === 0 ? true : (displayedSummary?.isCurrent ?? true);

  // §5.4 rule 0 — Version Not Found: a routed :versionNumber is present and does not resolve.
  const versionNotFound = routedVersionNumber !== undefined && briefState.briefVersionNotFound;

  // §5.4 rule 1 — In-progress, current version (or no version yet).
  const showProgressPanel =
    !versionNotFound &&
    run !== null &&
    run.outcome === 'in-progress' &&
    (workspace.briefs.length === 0 || displayedIsCurrent);

  // §5.4 rule 2 — Viewing a prior version.
  const showViewingPriorVersion = !versionNotFound && !showProgressPanel && !displayedIsCurrent;

  // §5.4 rule 3 — Failed, current version (excluding the no-new-usable-evidence correction result,
  // which falls through to rule 4's Brief-Generated summary).
  const failedStep =
    run?.outcome === 'failed' ? run.steps.find((s) => s.outcome === 'failed') : undefined;
  const showGenerationFailed =
    !versionNotFound &&
    !showProgressPanel &&
    !showViewingPriorVersion &&
    displayedIsCurrent &&
    run?.outcome === 'failed' &&
    workspace.investigation.status !== 'blocked' &&
    failedStep?.error !== 'no-new-usable-evidence';

  return (
    <div className="screen investigation-workspace-screen">
      <InvestigationIdentityHeader
        investigation={workspace.investigation}
        briefs={workspace.briefs}
        displayedBrief={briefState.brief}
      />
      <SourceListPanel sources={workspace.investigation.sources} />

      {versionNotFound ? (
        <section className="outcome-status-panel outcome-status-panel--version-not-found" role="status">
          Version {routedVersionNumber} does not exist for this Investigation.
        </section>
      ) : showProgressPanel && run ? (
        <GenerationProgressPanel
          investigationId={workspace.investigation.id}
          generationRun={run}
          onWorkspaceChanged={load}
        />
      ) : showViewingPriorVersion ? (
        <ViewingPriorVersionPanel
          investigationId={workspace.investigation.id}
          forwardSupersededByVersionNumber={displayedSummary?.forwardSupersededByVersionNumber ?? null}
          latestGenerationRun={run}
        />
      ) : showGenerationFailed ? (
        <GenerationFailedPanel workspace={workspace} onWorkspaceChanged={load} />
      ) : workspace.investigation.status === 'blocked' ? (
        <BlockedSourcesPanel
          investigationId={workspace.investigation.id}
          sources={workspace.investigation.sources}
          onWorkspaceChanged={load}
        />
      ) : workspace.investigation.status === 'brief-generated' ? (
        <BriefGeneratedSummaryPanel workspace={workspace} onWorkspaceChanged={load} />
      ) : (
        <OpenEligiblePanel workspace={workspace} onWorkspaceChanged={load} />
      )}

      {!versionNotFound && briefState.brief ? <BriefReviewPanel brief={briefState.brief} /> : null}
      {!versionNotFound && workspace.generationRuns.length > 0 ? (
        <ProvenanceRail brief={briefState.brief} workspace={workspace} />
      ) : null}

      {/* Region 5 — Decision Area, once >=1 BriefVersion exists (§5.3). Decision controls act on
          whichever version (current or prior) is currently on screen. */}
      {!versionNotFound && workspace.briefs.length > 0 && briefState.brief ? (
        <section className="decision-area">
          <DecisionForm
            pending={decisionSubmission.pending}
            error={decisionSubmission.error}
            onSubmit={handleDecisionSubmit}
          />
          {decisionSubmission.confirmedDecisionId ? (
            <DecisionConfirmationPanel confirmedDecisionId={decisionSubmission.confirmedDecisionId} />
          ) : null}
          <DecisionHistoryBanner
            investigationId={workspace.investigation.id}
            priorDecisions={briefState.brief.priorDecisions}
            decisionLineage={workspace.decisionLineage}
          />
        </section>
      ) : null}
    </div>
  );
}
