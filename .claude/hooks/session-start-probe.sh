#!/usr/bin/env bash
# SessionStart hook — runs the ground-truth probe and injects its output as
# additionalContext BEFORE any memory/LORE priming happens. "Signpost, not
# pillar": this is the pillar half — see department-os CLAUDE.md and
# agent-rig docs/specs/agent-rig-ddrs/DDR-004-session-start-pillar-binding.md.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROBE_OUTPUT="$("$REPO_DIR/scripts/session_probe.py" 2>&1 || true)"

python3 - "$PROBE_OUTPUT" <<'PYEOF'
import json
import sys

probe_output = sys.argv[1]
context = (
    "GROUND-TRUTH PROBE (ran automatically, before any memory/LORE priming — "
    "signpost/not-pillar discipline, see CLAUDE.md Session Start Behaviour). "
    "This reflects what is verifiably true right now. Prior-session memory "
    "and docs are the signpost; this is the pillar. Do not assert a status "
    "claim that contradicts this output without re-checking.\n\n"
    + probe_output
)
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": context,
    }
}))
PYEOF
