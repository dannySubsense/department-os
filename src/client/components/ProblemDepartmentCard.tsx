import { Link } from 'react-router-dom';
import type { MissionControlProblemDepartmentSummary } from '../../types/readModels.js';

/** NEW (§0a, replacing the removed Installed-Departments strip). Renders
 *  `MissionControlView.problemDepartment` as a single card. The entire card is a clickable
 *  navigation target (`<Link>` wrapping the whole card) AND contains an explicit,
 *  separately-visible "Open Problem Department →" affordance inside it — both are required
 *  simultaneously (Danny's ruling item 2). Renders no `installed`/`planned` label or badge
 *  (Danny's ruling item 1); counts degrade to `0`, never a placeholder (Danny's ruling item 3). */
export function ProblemDepartmentCard({
  problemDepartment,
}: {
  problemDepartment: MissionControlProblemDepartmentSummary;
}) {
  return (
    <Link
      to="/departments/problem-department"
      className="problem-department-card"
      aria-label={`Open ${problemDepartment.name}`}
    >
      <h2 className="problem-department-card__name">{problemDepartment.name}</h2>
      <p className="problem-department-card__thesis">{problemDepartment.thesis}</p>
      <dl className="problem-department-card__counts">
        <div className="problem-department-card__count">
          <dt>Investigations</dt>
          <dd className="data-value">{problemDepartment.investigationCount}</dd>
        </div>
        <div className="problem-department-card__count">
          <dt>Active</dt>
          <dd className="data-value">{problemDepartment.activeCount}</dd>
        </div>
        <div className="problem-department-card__count">
          <dt>Needs Attention</dt>
          <dd className="data-value">{problemDepartment.needsAttentionCount}</dd>
        </div>
        <div className="problem-department-card__count">
          <dt>Recent Completed</dt>
          <dd className="data-value">{problemDepartment.recentCompletedCount}</dd>
        </div>
      </dl>
      <span className="problem-department-card__affordance">Open Problem Department →</span>
    </Link>
  );
}
