import type {
  InvestigationStatus,
  RecommendationDecision,
  EvidenceLabel,
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
  departments: DepartmentSummary[];
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
