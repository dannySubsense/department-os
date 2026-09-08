import type { BriefElement, NegativeFinding } from '../../../types/domain.js';

interface NegativeFindingNoticeProps {
  negativeFindings: NegativeFinding[];
  element: BriefElement;
}

/** Renders for exactly the four negatable elements ('evidence', 'demand-signal-type',
 *  'existing-solution', 'gap-hypothesis') — Problem Definition never renders it, because
 *  `BriefElement` has no 'problem-statement' member (§0's binding rule). Renders the real
 *  persisted `statement` text, never a placeholder or restatement of the label. */
export function NegativeFindingNotice({ negativeFindings, element }: NegativeFindingNoticeProps) {
  const finding = negativeFindings.find((nf) => nf.element === element);
  if (!finding) return null;
  return (
    <p className="negative-finding-notice" role="status">
      {finding.statement}
    </p>
  );
}
