# Invariants

Inviolable rules for implementation work in this repo.

1. Every predetermined number needs a citable source, an explicit
   PROVISIONAL-tag-with-named-owner, or deletion. (CONTRIBUTING.md#research-data-integrity,
   referenced by principles.md)
2. A complete vertical slice touches every layer it needs — evidence,
   workflow state, and a decision. A UI-only or backend-only change is not
   complete. (principles.md)
3. No speculative infrastructure — frameworks, services, CI, or
   abstractions are not scaffolded ahead of a concrete, current need.
   (principles.md)
4. No agent runtime is forked, embedded, or assumed until tested against a
   real vertical slice. (principles.md)
5. Department OS owns the substrate; runtimes are replaceable execution
   components. (principles.md)
6. Independent review requires independent sources, not just independent
   reviewers reading the same well — give an auditor the objective,
   requirements, acceptance criteria, and diff, never the author's method
   or checklist. (development-workflow.md)
7. Frank's binding verdict has no manual override. (development-workflow.md)
8. No direct pushes to main after bootstrap without explicit exception; no
   force-push on shared/reviewed branches without explicit direction.
   (development-workflow.md, "Git and Review Workflow" — confirmed 2026-08-09
   as CLAUDE.md's local Git Workflow declaration was corrected to match this
   tracked policy, which it had been silently contradicting)
9. Every PR ties to an approved intake, spec, milestone, or recorded
   decision — never opened speculatively. (development-workflow.md)
