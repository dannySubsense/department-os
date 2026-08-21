import { StartInvestigationForm } from './StartInvestigationForm.js';

interface InvestigationPortfolioEmptyStateProps {
  onSubmitted: (investigationId: string) => void;
}

/** Renders the exact copy "No investigations yet — Start Investigation" plus the same
 *  `StartInvestigationForm` (03-UI-SPEC.md § Empty State). Mutually exclusive with
 *  `InvestigationPortfolioTable` — never both mounted at once. */
export function InvestigationPortfolioEmptyState({
  onSubmitted,
}: InvestigationPortfolioEmptyStateProps) {
  return (
    <div className="investigation-portfolio-empty-state">
      <p className="investigation-portfolio-empty-state__copy">
        No investigations yet — Start Investigation
      </p>
      <StartInvestigationForm onSubmitted={onSubmitted} />
    </div>
  );
}
