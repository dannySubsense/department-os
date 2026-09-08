import type { PersonalPullNote } from '../../../types/domain.js';

interface PersonalPullSectionProps {
  personalPullNotes: PersonalPullNote[];
}

/** Rendered structurally separate from Demand Evidence — Personal Pull is contextual motivation,
 *  never counted toward demand (US-12, US-4 AC4). May be empty (not a required element, no
 *  NegativeFindingNotice — Personal Pull is not one of the four negatable elements). */
export function PersonalPullSection({ personalPullNotes }: PersonalPullSectionProps) {
  if (personalPullNotes.length === 0) return null;
  return (
    <section className="brief-review-panel__section brief-review-panel__section--personal-pull">
      <h3>Personal Pull</h3>
      <ul>
        {personalPullNotes.map((note) => (
          <li key={note.id}>{note.text}</li>
        ))}
      </ul>
    </section>
  );
}
