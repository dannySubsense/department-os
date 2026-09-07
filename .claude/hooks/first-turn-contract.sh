#!/usr/bin/env bash
# Stop — first-turn FOOTER contract enforcement (wrapper).
# Captures stdin, replays it to scripts/first_turn_contract_probe.py under a bounded timeout,
# validates the output shape, and fails open on every failure mode. A Stop hook whose only
# power is to block must, on any error, emit nothing — see
# docs/tooling/first-turn-contract-enforcement.md §3.4/§4.2.
# Structurally identical to .claude/hooks/session-queue.sh in layout only — NOT in the timeout
# rationale (see below).
set -uo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_DIR" || exit 0

STDIN_FILE="$(mktemp)"
STDOUT_FILE="$(mktemp)"
STDERR_FILE="$(mktemp)"
trap 'rm -f "$STDIN_FILE" "$STDOUT_FILE" "$STDERR_FILE"' EXIT

# Capture the hook's stdin (session_id, transcript_path, stop_hook_active,
# last_assistant_message, etc.) and replay it to the probe.
cat >"$STDIN_FILE"

# Write a probe_error TrackRecordEntry (spec §6 exact schema) ourselves, for any path where the
# probe did not get the chance to write its own — non-zero exit, timeout kill, not-executable,
# or output that doesn't validate as JSON/shape (which means it never reached emit_block/
# emit_allow either). On a clean exit-0 run the probe's own main()/run() already wrote a line
# (allow, block, or its own probe_error) — this function must not run on that path, or §7's
# denominator gets a duplicate. Never lets a failure here affect the wrapper's own exit code.
write_probe_error() {
  local cause="$1"
  python3 - "$REPO_DIR" "$STDIN_FILE" "$cause" <<'PYEOF' || true
import json
import os
import sys
from datetime import datetime, timezone

repo_dir, stdin_path, cause = sys.argv[1], sys.argv[2], sys.argv[3]
track_record_path = os.path.join(
    repo_dir, "docs", "tooling", "first-turn-contract-track-record.jsonl"
)

session_id = None
stop_hook_active = False
try:
    with open(stdin_path) as f:
        data = json.loads(f.read())
    if isinstance(data, dict):
        session_id = data.get("session_id")
        stop_hook_active = bool(data.get("stop_hook_active", False))
except Exception:
    pass

entry = {
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "session_id": session_id,
    "stop_hook_active": stop_hook_active,
    "queue_injected": False,
    "first_turn": False,
    "decision": "probe_error",
    "violations": [],
    "reason": None,
    "probe_error": cause,
}
try:
    os.makedirs(os.path.dirname(track_record_path), exist_ok=True)
    with open(track_record_path, "a") as fh:
        fh.write(json.dumps(entry) + "\n")
except Exception:
    pass
PYEOF
}

# PROVISIONAL — owner: wright. 5s budget. Measured directly against this probe (not inherited
# from session-queue.sh's rationale, which does not transfer): 167ms on a 5.4 MB / 3203-record
# transcript, 85ms on a 1.9 MB transcript — roughly 30x headroom at 5s. This probe has no inner
# timeout of its own (unlike session_queue_probe.py's 3s connect timeout, which exists so an
# inner failure fires before this outer one and produces a real error instead of a silent kill)
# — a `timeout` kill here is always the silent case, so the outer bound is the only one guarding
# against a hang, and 5s is chosen generous relative to the measured cost, not to let an inner
# timeout preempt it.
PROBE_EXIT=0
timeout 5 "$REPO_DIR/scripts/first_turn_contract_probe.py" <"$STDIN_FILE" >"$STDOUT_FILE" 2>"$STDERR_FILE" || PROBE_EXIT=$?

OUT="$(cat "$STDOUT_FILE")"

# Validate stdout is either empty/"{}" (allow), or valid JSON matching FirstTurnHookOutput's
# shape: decision === "block" with a non-empty string reason. Anything else — non-JSON, a
# decision value other than "block", "block" with no reason, non-zero probe exit, timeout —
# is probe failure -> fail open (emit nothing, exit 0). Spec §3.4 step 3/4.
if [ "$PROBE_EXIT" -eq 124 ] || [ "$PROBE_EXIT" -eq 137 ]; then
  write_probe_error "timeout: probe killed after 5s"
  exit 0
fi

if [ "$PROBE_EXIT" -ne 0 ]; then
  ERR="$(cat "$STDERR_FILE")"
  write_probe_error "non-zero exit ${PROBE_EXIT}: ${ERR:-(no stderr)}"
  exit 0
fi

if [ -z "$OUT" ]; then
  # Empty stdout on a clean exit is an explicit allow — the probe already wrote its own
  # track-record line (run()'s allow branches, §6). Nothing more to log here.
  exit 0
fi

RESULT="$(printf '%s' "$OUT" | python3 -c '
import json, sys

raw = sys.stdin.read()
try:
    data = json.loads(raw)
except Exception:
    sys.exit(1)

# Allow: {} or any dict with no "decision" key.
if isinstance(data, dict) and "decision" not in data:
    sys.exit(0)

if not isinstance(data, dict):
    sys.exit(1)

if data.get("decision") != "block":
    sys.exit(1)

reason = data.get("reason")
if not isinstance(reason, str) or not reason.strip():
    sys.exit(1)

# Valid block: print it back out unchanged for the wrapper to relay.
print(json.dumps({"decision": "block", "reason": reason}))
sys.exit(0)
' 2>/dev/null)"
VALIDATE_EXIT=$?

if [ "$VALIDATE_EXIT" -ne 0 ]; then
  # This branch assumes the probe did not already write its own track-record line for this
  # invocation. That assumption holds today only because the shipped probe has exactly one
  # stdout write (emit_block's print, valid by construction) and emit_allow prints nothing —
  # so a clean exit with malformed stdout cannot currently coexist with a prior
  # write_track_record call. It is NOT a guarantee this code enforces: if a future edit gives
  # the probe any other stdout path (e.g. a debug print before a real write_track_record call),
  # this becomes a double-write for that invocation — the probe's own correct line plus a
  # spurious probe_error line here. Bounded consequence if that ever happens: no effect on the
  # block/allow decision reaching Claude Code (this path never emits anything), and no effect
  # on §7's propagation count (a probe_error line here carries queue_injected: false, so it is
  # excluded from the qualifying-invocation denominator regardless).
  write_probe_error "malformed probe stdout (exit 0, invalid shape): ${OUT}"
  exit 0
fi

if [ -n "$RESULT" ]; then
  # Clean exit-0 block: the probe already wrote its own "block" track-record line before
  # printing this. Do not write a second entry.
  printf '%s' "$RESULT"
fi
exit 0
