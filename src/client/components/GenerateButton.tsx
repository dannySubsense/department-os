interface GenerateButtonProps {
  label: string;
  enabled: boolean;
  onClick: () => void;
}

/** One shared component, one behavioral contract — hosted by `OpenEligiblePanel` ("Start
 *  generation"), `GenerationFailedPanel` ("Retry generation"), and (C2-S4)
 *  `BriefGeneratedSummaryPanel` ("Regenerate with new source snapshot"). Three label states, one
 *  component, never three divergent implementations (02-ARCHITECTURE.md §4.2 Implementation
 *  Notes). */
export function GenerateButton({ label, enabled, onClick }: GenerateButtonProps) {
  return (
    <button type="button" className="generate-button" disabled={!enabled} onClick={onClick}>
      {label}
    </button>
  );
}
