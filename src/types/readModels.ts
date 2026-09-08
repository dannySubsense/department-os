import type {
  InvestigationStatus,
  RecommendationDecision,
  EvidenceLabel,
  SourceArtifactType,
  SourceResolution,
  SchemaValidationRecord,
  ToolInvocationRecord,
  AssignedValidityState,
  ReconsiderationConditionType,
} from './domain.js';

/** Checkpoint-1-scoped replacement for DESIGN-PROPOSAL.md §8's `ActivityFeedEntry` — omits
 *  `currentComponent` (sourced from `generation_component_event`, a Checkpoint-3 table that does
 *  not exist yet) and `completedSteps` (would require joining `generation_step`, deferred — this
 *  checkpoint's AC requires GenerationRun-level data only, not per-step detail). Every field here
 *  traces to a real `generation_run` column. */
export interface GenerationRunSummary {
  generationRunId: string;
  investigationId: string;
  runtimeIdentifier: string;
  outcome: 'in-progress' | 'succeeded' | 'failed';
  startedAt: string;
  completedAt: string | null;
}

export interface DepartmentSummary {
  id: string; // stable slug, e.g. 'problem-department' — not a DB row
  name: string;
  thesis: string;
  status: 'installed' | 'planned';
}

/** POST-CORRECTION (§0a) — Mission Control's Problem-Department card summary. Deliberately
 *  separate from `DepartmentSummary`: carries no `status` field, so it structurally cannot leak
 *  an installed/planned label onto Mission Control (Danny's ruling item 1). Every count below is
 *  either a direct COUNT(*) (`investigationCount`) or the `.length` of an array
 *  `getMissionControlView` already assembles for `activeWork` (§5.3) — no fabricated field
 *  (Danny's ruling item 3). */
export interface MissionControlProblemDepartmentSummary {
  id: string; // 'problem-department', from departmentRegistry
  name: string; // from departmentRegistry
  thesis: string; // from departmentRegistry
  investigationCount: number; // COUNT(*) of all Investigation rows
  activeCount: number; // activeWork.active.length
  needsAttentionCount: number; // activeWork.needsAttention.length
  recentCompletedCount: number; // activeWork.recentCompleted.length
}

export interface InvestigationSummary {
  id: string;
  status: InvestigationStatus;
  statusReason?: string;
  createdAt: string;
  lastActivityAt: string; // §4a GREATEST computation, ISO timestamp, checkpoint-1-restricted set
}

export interface BriefSummary {
  briefVersionId: string;
  investigationId: string;
  versionNumber: number;
  createdAt: string;
  recommendationDecision: RecommendationDecision;
}

export interface EvidenceSummary {
  evidenceItemId: string;
  investigationId: string;
  label: EvidenceLabel;
  excerptOrSummary: string;
}

export type DepartmentsView = DepartmentSummary[];

export interface MissionControlView {
  problemDepartment: MissionControlProblemDepartmentSummary;
  activeWork: {
    active: InvestigationSummary[]; // has an in-progress GenerationRun — a real run IS
    // running right now (Danny's correction, §5.3)
    readyNotStarted: InvestigationSummary[]; // status='open', zero GenerationRun rows at all —
    // was previously folded into `active`; split out per
    // Danny's correction so "Active" only ever means a
    // real run in progress
    needsAttention: InvestigationSummary[];
    recentCompleted: InvestigationSummary[];
  };
  activeActivity: GenerationRunSummary[]; // in-progress GenerationRuns, Core-wide (today: PD only)
  recent: {
    investigations: InvestigationSummary[]; // ordered by lastActivityAt, see §4
    briefs: BriefSummary[];
    evidence: EvidenceSummary[];
  };
}

export interface ProblemDepartmentOverview {
  department: DepartmentSummary;
  investigations: InvestigationSummary[];
  lastActiveInvestigationId: string | null;
  sourceCount: number;
  evidenceCount: number;
  recentRuns: GenerationRunSummary[];
}

// ---- Investigation Workspace Read Model (Product Surface Checkpoint 2, §3.2) ----

export interface WorkspaceInvestigationSummary {
  id: string;
  createdAt: string;
  status: InvestigationStatus;
  statusReason: string | null;
  sourceCount: number;
  sources: Array<{
    id: string;
    type: SourceArtifactType;
    raw: string;
    resolutionStatus: SourceResolution['status'];
    failureReason?: string; // populated only when resolutionStatus === 'unreachable'
    noContentReason?: string; // populated only when resolutionStatus === 'reachable-no-content'
  }>;
}

/** Exactly the persisted GenerationStep facts (US-4 AC1) — no field here is ever computed from
 *  "what the pipeline is doing right now." */
export interface WorkspaceGenerationStepSummary {
  component: string;
  startedAt: string;
  completedAt: string;
  outcome: 'succeeded' | 'failed';
  error?: string;
  modelIdentifier?: string;
  validationRecords?: SchemaValidationRecord[];
  toolInvocations?: ToolInvocationRecord[];
}

/** One WebSearchQuery + its results, scoped to one GenerationRun. */
export interface WorkspaceWebSearchQuerySummary {
  id: string;
  query: string;
  performedAt: string;
  scopeNote: string | null;
  limitations: string[]; // populated by joining query_limitation.reason rows for this
  // web_search_query.id, never by reading web_search_query.limitations directly (§3.2)
  results: Array<{
    url: string;
    retrievedAt: string;
    status: 'retrieved' | 'blocked' | 'failed';
    failureReason?: string;
  }>;
}

/** One GenerationRun as reported to the workspace. `livenessState` is computed at READ time from
 *  persisted facts only (§4.9) — never itself a stored column. */
export interface WorkspaceGenerationRunSummary {
  id: string;
  outcome: 'in-progress' | 'succeeded' | 'failed';
  livenessState: 'active' | 'stale-or-interrupted' | 'terminal';
  startedAt: string;
  completedAt: string | null; // null iff outcome === 'in-progress'
  runtimeIdentifier: string;
  steps: WorkspaceGenerationStepSummary[]; // persisted steps only, in step_index order
  webSearchQueries: WorkspaceWebSearchQuerySummary[]; // every WebSearchQuery for this run
}

export interface WorkspaceBriefSummary {
  briefVersionId: string;
  versionNumber: number;
  createdAt: string;
  isCurrent: boolean;
  assignedState: AssignedValidityState; // 'valid' by construction when no StatusEvent exists yet
  isSuperseded: boolean;
  forwardSupersededByVersionNumber: number | null;
}

export interface WorkspaceDecisionSummary {
  id: string;
  briefVersionId: string; // internal id — not rendered as primary content
  versionNumber: number; // human-readable version reference (US-1 AC5)
  decision: RecommendationDecision;
  decidedAt: string;
  rationale?: string;
  reconsiderationConditions: Array<{
    type: ReconsiderationConditionType;
    otherTypeLabel?: string;
    description: string;
  }>;
}

/** GET /api/investigations/:id/workspace response (§3.2). `briefs`/`decisionLineage`/
 *  `newSourceSnapshotSinceCurrentBriefVersion` are honestly empty/false in this slice — no
 *  ProblemBrief/Decision row can exist yet, and §4.8's eligibility mechanism is C2-S3's scope. */
export interface InvestigationWorkspaceView {
  investigation: WorkspaceInvestigationSummary;
  generationRuns: WorkspaceGenerationRunSummary[]; // ALL runs for this Investigation, newest first
  latestGenerationRun: WorkspaceGenerationRunSummary | null; // = generationRuns[0]
  briefs: WorkspaceBriefSummary[];
  decisionLineage: WorkspaceDecisionSummary[];
  generationEligible: boolean;
  newSourceSnapshotSinceCurrentBriefVersion: boolean;
}
