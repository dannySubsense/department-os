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
    "GROUND-TRUTH PROBE OUTPUT (script-generated git/docs state only — this "
    "is NOT memory priming and does NOT satisfy CLAUDE.md's Session Start "
    "Behaviour step). It reflects what is verifiably true right now about "
    "the repo; prior-session memory and docs are the signpost, this is the "
    "pillar you verify them against — but it does not replace them.\n\n"
    + probe_output
    + "\n\n"
    "ACTION REQUIRED BEFORE YOUR FIRST REPLY: call search_knowledge per "
    "CLAUDE.md's Session Start Behaviour section now, if you have not "
    "already done so this session. This probe output being present is not "
    "evidence that step happened — it is a separate, still-pending step."
)
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": context,
    }
}))
PYEOF
