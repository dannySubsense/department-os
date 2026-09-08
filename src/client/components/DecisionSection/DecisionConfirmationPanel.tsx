interface DecisionConfirmationPanelProps {
  confirmedDecisionId: string; // owned by the parent screen's decisionSubmission state (§5.2)
}

/** In-place confirmation on the same URL — no navigation (US-10 AC10). Renders once the parent
 *  screen's `decisionSubmission.confirmedDecisionId` is set, which itself is only set after the
 *  dual-refetch mechanism (SOL-MEDIUM-4 fix) has confirmed both real GETs returned — this
 *  component itself performs no fetch and holds no list state, "Your decision" copy only, no
 *  `decidedBy`/actor field. */
export function DecisionConfirmationPanel({ confirmedDecisionId }: DecisionConfirmationPanelProps) {
  if (!confirmedDecisionId) return null;
  return (
    <div className="decision-confirmation-panel" role="status">
      Your decision was recorded.
    </div>
  );
}
