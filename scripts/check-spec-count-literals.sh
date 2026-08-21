#!/usr/bin/env bash
# Mechanical check for the count-drift defect class that failed this sprint's spec-gate 4 times
# (B-2/B-6, C-1/C-2/C-3, C-4, C-5 — see docs/specs/product-surface-checkpoint-1/GATE-LOG.md).
# A prose review sweep is capped by whatever the reviewer's eye happens to cover; this script
# enumerates every digit-adjacent-to-an-enumerable-noun occurrence across a spec doc set so a
# human/agent classifies each hit once, instead of re-deriving the search from scratch each pass.
#
# Usage: scripts/check-spec-count-literals.sh docs/specs/<sprint-slug>
#
# This does NOT auto-classify hits as pass/fail — a specific citation ("US-6 AC4", "§5.3 queries
# 1-8") is legitimate and does not drift; an aggregate restatement ("6 user stories", "27 AC",
# "3 routes" when a 4th now exists) is the defect. Exit code is always 0 (informational); the
# caller/reviewer reads the output and judges each hit against the real source-of-truth doc.

set -euo pipefail

DIR="${1:?Usage: $0 <sprint-directory>}"
NOUNS='(independent )?(user stor(y|ies)|AC|acceptance criteri[ao]n?|screens?|flows?|routes?|quer(y|ies)|slices?|sections?|components?)'

echo "# Count-literal sweep: $DIR"
echo "# Generated $(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo '(date unavailable)')"
echo

for f in "$DIR"/0[1-4]-*.md; do
  [ -f "$f" ] || continue
  hits=$(grep -noE "[0-9]+ $NOUNS" "$f" || true)
  [ -z "$hits" ] && continue
  echo "## $(basename "$f")"
  while IFS=: read -r lineno _; do
    line=$(sed -n "${lineno}p" "$f")
    printf '%s:%s  %s\n' "$(basename "$f")" "$lineno" "$line"
  done <<< "$hits"
  echo
done

echo "# Classification guide:"
echo "# - digit immediately adjacent to 'US-N' or '§X.Y' (e.g. 'US-6 AC4', 'queries 1-8') = specific citation, SAFE"
echo "# - a bare aggregate ('N user stories', 'N AC' with no ID, 'N screens/routes/flows' as a"
echo "#   total) = must match the CURRENT count in its cited source doc, or be a pointer instead"
