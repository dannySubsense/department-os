interface SourcesEvidenceCountsProps {
  sourceCount: number;
  evidenceCount: number;
}

/** Presentational: renders the two counts already present on the fetched `ProblemDepartmentOverview`
 *  — no independent fetch of its own (§2, §8 Anti-Patterns). */
export function SourcesEvidenceCounts({ sourceCount, evidenceCount }: SourcesEvidenceCountsProps) {
  return (
    <dl className="sources-evidence-counts">
      <div className="sources-evidence-counts__item">
        <dt>Sources</dt>
        <dd className="data-value">{sourceCount}</dd>
      </div>
      <div className="sources-evidence-counts__item">
        <dt>Evidence</dt>
        <dd className="data-value">{evidenceCount}</dd>
      </div>
    </dl>
  );
}
