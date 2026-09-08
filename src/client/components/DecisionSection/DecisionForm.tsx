import { useState } from 'react';
import type { ReconsiderationConditionInput } from '../../api.js';
import type { RecommendationDecision, ReconsiderationConditionType } from '../../../types/domain.js';

const RECONSIDERATION_CONDITION_TYPES: ReconsiderationConditionType[] = [
  'new-evidence',
  'product-change',
  'stronger-demand-signal',
  'feasibility-shift',
  'price-change',
  'market-event',
  'other',
];

interface ConditionRow {
  type: ReconsiderationConditionType;
  otherTypeLabel: string;
  description: string;
}

export interface DecisionFormSubmission {
  decision: RecommendationDecision;
  rationale?: string;
  reconsiderationConditions: ReconsiderationConditionInput[];
}

interface DecisionFormProps {
  pending: boolean; // owned by the parent screen's decisionSubmission state (§5.2)
  error: string | null; // owned by the parent screen's decisionSubmission state (§5.2)
  onSubmit: (submission: DecisionFormSubmission) => void;
}

/** Approve / Reject / Watch controls (US-10). Bubbles a validated submission up to the parent
 *  screen, which owns the actual `submitDecision` call and the `decisionSubmission` state
 *  (`pending`/`error`/`confirmedDecisionId`, §5.2) — this component holds no submission-outcome
 *  state itself. Watch submit stays disabled until at least one non-whitespace reconsideration
 *  condition is entered — no `onSubmit` call is made for a zero-condition Watch attempt
 *  (client-side guard; the server enforces the same rule in defense-in-depth). */
export function DecisionForm({ pending, error, onSubmit }: DecisionFormProps) {
  const [selectedDecision, setSelectedDecision] = useState<RecommendationDecision | null>(null);
  const [rationale, setRationale] = useState('');
  const [conditions, setConditions] = useState<ConditionRow[]>([
    { type: 'new-evidence', otherTypeLabel: '', description: '' },
  ]);

  const hasNonWhitespaceCondition = conditions.some((c) => c.description.trim().length > 0);
  const submitDisabled =
    pending || selectedDecision === null || (selectedDecision === 'Watch' && !hasNonWhitespaceCondition);

  function updateCondition(index: number, field: keyof ConditionRow, value: string) {
    setConditions((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  }

  function addCondition() {
    setConditions((prev) => [...prev, { type: 'new-evidence', otherTypeLabel: '', description: '' }]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedDecision === null) return;
    if (selectedDecision === 'Watch' && !hasNonWhitespaceCondition) return; // client-side guard

    const reconsiderationConditions: ReconsiderationConditionInput[] =
      selectedDecision === 'Watch'
        ? conditions
            .filter((c) => c.description.trim().length > 0)
            .map((c) => ({
              type: c.type,
              otherTypeLabel: c.type === 'other' ? c.otherTypeLabel.trim() : undefined,
              description: c.description.trim(),
            }))
        : [];

    onSubmit({
      decision: selectedDecision,
      rationale: rationale.trim().length > 0 ? rationale.trim() : undefined,
      reconsiderationConditions,
    });
  }

  return (
    <form className="decision-form" onSubmit={handleSubmit}>
      <h3 className="decision-form__label">Your decision</h3>
      <div className="decision-form__decision-controls">
        {(['Approve', 'Reject', 'Watch'] as RecommendationDecision[]).map((option) => (
          <button
            key={option}
            type="button"
            className={`decision-form__decision-button${selectedDecision === option ? ' decision-form__decision-button--selected' : ''}`}
            disabled={pending}
            onClick={() => setSelectedDecision(option)}
          >
            {option}
          </button>
        ))}
      </div>

      {selectedDecision === 'Approve' || selectedDecision === 'Reject' ? (
        <label className="decision-form__rationale">
          Rationale (optional)
          <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} disabled={pending} />
        </label>
      ) : null}

      {selectedDecision === 'Watch' ? (
        <div className="decision-form__conditions">
          <p className="decision-form__conditions-label">
            At least one reconsideration condition is required.
          </p>
          {conditions.map((condition, index) => (
            <div className="decision-form__condition-row" key={index}>
              <select
                aria-label="Condition type"
                value={condition.type}
                onChange={(e) => updateCondition(index, 'type', e.target.value)}
                disabled={pending}
              >
                {RECONSIDERATION_CONDITION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              {condition.type === 'other' ? (
                <input
                  type="text"
                  aria-label="Other condition label"
                  placeholder="Label this condition"
                  value={condition.otherTypeLabel}
                  onChange={(e) => updateCondition(index, 'otherTypeLabel', e.target.value)}
                  disabled={pending}
                />
              ) : null}
              <input
                type="text"
                aria-label="Condition description"
                placeholder="Describe the condition…"
                value={condition.description}
                onChange={(e) => updateCondition(index, 'description', e.target.value)}
                disabled={pending}
              />
            </div>
          ))}
          <button type="button" onClick={addCondition} disabled={pending}>
            + Add another condition
          </button>
        </div>
      ) : null}

      {selectedDecision !== null ? (
        <button type="submit" disabled={submitDisabled}>
          {pending ? 'Submitting…' : `Submit ${selectedDecision}`}
        </button>
      ) : null}

      {error ? (
        <p className="decision-form__error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
