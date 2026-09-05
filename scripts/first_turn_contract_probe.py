#!/usr/bin/env python3
"""Stop hook — first-turn FOOTER contract enforcement (probe core).

Reads Stop-hook stdin JSON (+ the session transcript, C3 only) and applies three checks
to the first turn of a queue-injected session (per `scripts/session_queue_probe.py`'s
FOOTER contract):

  C1 — Signpost must precede Pillar (order).
  C2 — no forbidden third "not (yet) verified (this session)" section.
  C3 — a Pillar section's claimed subject(s) (file paths, PR/issue numbers, identifiers,
       commands, quoted queries) must each be backed by a qualifying tool call whose target
       matches that subject; falls back to presence-only (at least one qualifying tool call
       exists) when the section yields no extractable subject (see
       docs/tooling/first-turn-contract-c3-claim-matching/SPEC.md §3-4).

Emits the block/allow decision Claude Code's `Stop` hook understands (top-level
`{"decision": "block", "reason": ...}`, or nothing/`{}` to allow — see
docs/tooling/first-turn-contract-enforcement.md §3.2) and appends one entry per
invocation to the gitignored track-record log (§6).

Pure function of stdin (+ transcript, C3 only). No LORE access, no network. Never blocks
on its own failure — any exception here is caught and treated as an allow, with a
`probe_error` track-record entry (§4.2's wrapper-level fail-open is the outer guarantee;
this is this probe's own inner one).
"""

import json
import os
import re
import sys
from datetime import datetime, timezone

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRACK_RECORD_PATH = os.path.join(
    REPO_ROOT, "docs", "tooling", "first-turn-contract-track-record.jsonl"
)

# The first line of session_queue_probe.py's HEADER (§5.1) — emitted only on the success
# path (a tagged queue row was found and injected).
QUEUE_MARKER = "SESSION QUEUE — SIGNPOST, NOT PILLAR."

# Tools excluded from C3's qualifying-tool-call set (§5.4) — bookkeeping, not verification.
C3_EXCLUDED_TOOLS = {"TodoWrite"}

# §5.2/§5.3 — heading-line predicate: after leading whitespace/#/* markup is stripped, a
# line starting with Signpost or Pillar, followed (before end of line) by a colon that
# closes the heading label. Trailing prose on the same line is permitted.
_SIGNPOST_PILLAR_HEADING_RE = re.compile(
    r"^(Signpost|Pillar)\b[^:\n]*:\s*\**\s*$|^(Signpost|Pillar)\b[^:\n]*:\s*\**\s*\S",
    re.IGNORECASE,
)

# §5.3 — general heading-line shape used to extract a label for the C2 test: leading text
# up to a colon that closes the label, then either end of line or trailing content.
_GENERIC_HEADING_RE = re.compile(r"^([^:\n]+):\s*\**\s*($|\S)")

# §5.3 — the forbidden third-section label.
_C2_LABEL_RE = re.compile(r"^not\s+(yet\s+)?verified(\s+this\s+session)?\s*$", re.IGNORECASE)


def read_stdin():
    """Best-effort stdin JSON parse. Absence or malformed stdin must not crash the probe;
    the caller treats a resulting empty dict as "nothing to check", which allows."""
    try:
        raw = sys.stdin.read()
    except Exception:
        return {}
    if not raw or not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}
    return data


def strip_leading_markup(line):
    """Strip leading whitespace and markdown emphasis markers (#, *), per §5.2."""
    s = line
    while s and s[0] in " \t#*":
        s = s[1:]
    return s


def find_signpost_pillar_positions(text):
    """§5.2 — first Signpost heading line index and first Pillar heading line index (by
    line number in `text`), or None for either not found."""
    signpost_idx = None
    pillar_idx = None
    for idx, raw_line in enumerate(text.split("\n")):
        stripped = strip_leading_markup(raw_line)
        m = _SIGNPOST_PILLAR_HEADING_RE.match(stripped)
        if not m:
            continue
        label = (m.group(1) or m.group(2)).lower()
        if label == "signpost" and signpost_idx is None:
            signpost_idx = idx
        elif label == "pillar" and pillar_idx is None:
            pillar_idx = idx
    return signpost_idx, pillar_idx


def find_c2_heading_line(text):
    """§5.3 — the first heading line (generic shape) whose label matches the forbidden
    "not (yet) verified (this session)" pattern. Returns the raw (unstripped) line text,
    or None."""
    for raw_line in text.split("\n"):
        stripped = strip_leading_markup(raw_line)
        m = _GENERIC_HEADING_RE.match(stripped)
        if not m:
            continue
        label = m.group(1).strip()
        if _C2_LABEL_RE.match(label):
            return raw_line.strip()
    return None


def find_pillar_heading_line(text, pillar_idx):
    """Recover the raw heading line at `pillar_idx` for quoting in a C1/C3 reason."""
    if pillar_idx is None:
        return None
    lines = text.split("\n")
    if 0 <= pillar_idx < len(lines):
        return lines[pillar_idx].strip()
    return None


def load_transcript_records(transcript_path):
    """Parse the transcript JSONL, filtered to isSidechain: false (§5.1). Malformed lines
    are skipped; a missing/unreadable file yields an empty list (fail toward "not
    queue-injected", never toward blocking)."""
    if not transcript_path or not os.path.isfile(transcript_path):
        return []
    records = []
    try:
        with open(transcript_path, errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except Exception:
                    continue
                if not isinstance(obj, dict):
                    continue
                if obj.get("isSidechain") is not False:
                    continue
                records.append(obj)
    except Exception:
        return []
    return records


def _extract_message_texts(message):
    """Pull every text string out of a `message` dict's content, whether content is a
    bare string (user turns can be) or a list of content blocks (text blocks only —
    tool_use/tool_result/thinking blocks carry no prose to scan)."""
    if not isinstance(message, dict):
        return []
    content = message.get("content")
    if isinstance(content, str):
        return [content]
    if isinstance(content, list):
        texts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                text = block.get("text")
                if isinstance(text, str):
                    texts.append(text)
        return texts
    return []


def _extract_attachment_texts(attachment):
    """Pull text out of an `attachment` record's payload (e.g. SessionStart hook
    `additionalContext`, seen on this host as `type: "attachment"` records with no
    `message` key). `attachment.content` may be a bare string, a list of strings, or a
    list of content blocks; `attachment.stdout` (hook stdout capture) may also carry
    injected text."""
    if not isinstance(attachment, dict):
        return []
    texts = []
    for key in ("content", "stdout"):
        value = attachment.get(key)
        if isinstance(value, str):
            texts.append(value)
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, str):
                    texts.append(item)
                elif isinstance(item, dict):
                    text = item.get("text")
                    if isinstance(text, str):
                        texts.append(text)
    return texts


def extract_texts(record):
    """Pull every text string out of a transcript record — `message.content` (assistant
    and user turns) plus `attachment.content`/`attachment.stdout` (SessionStart queue
    injection and other hook-emitted records, which carry no `message` key on this
    host — see docs/tooling/first-turn-contract-enforcement.md §5.1)."""
    texts = _extract_message_texts(record.get("message"))
    texts.extend(_extract_attachment_texts(record.get("attachment")))
    return texts


def is_assistant_text_record(record):
    """An assistant record carrying real (non-empty, after stripping) text content —
    i.e. not a thinking-only or tool-use-only record (§5.1)."""
    if record.get("type") != "assistant":
        return False
    return any(t.strip() for t in extract_texts(record))


def analyze_queue_injection_and_first_turn(records):
    """§5.1 — (a) is the session queue-injected (HEADER marker present at or before the
    first assistant record), and (b) is the turn currently ending the *first* turn (at
    most one prior assistant-text record). Returns
    (queue_injected: bool, first_turn: bool, current_turn_index: int|None) where
    current_turn_index is the position, in `records`, of the last assistant-text record
    (the one `last_assistant_message` corresponds to), or None if no such record exists
    yet in the transcript."""
    first_assistant_idx = None
    for idx, r in enumerate(records):
        if r.get("type") == "assistant":
            first_assistant_idx = idx
            break

    queue_injected = False
    if first_assistant_idx is not None:
        scan_range = records[: first_assistant_idx + 1]
    else:
        scan_range = records
    for r in scan_range:
        for text in extract_texts(r):
            if QUEUE_MARKER in text:
                queue_injected = True
                break
        if queue_injected:
            break

    assistant_text_indices = [
        idx for idx, r in enumerate(records) if is_assistant_text_record(r)
    ]
    first_turn = len(assistant_text_indices) <= 1
    current_turn_index = assistant_text_indices[-1] if assistant_text_indices else None

    return queue_injected, first_turn, current_turn_index


# §3.1 — file-path extension allowlist. PROVISIONAL — owner: wright; rationale: covers the
# file types actually touched by this repo's own tooling and test suite as of this spec;
# extend as needed (see SPEC.md §3.1 for the full degradation-path rationale).
_FILE_EXTENSION_ALLOWLIST = {
    ".py", ".md", ".ts", ".tsx", ".json", ".sh", ".yml", ".yaml",
}

# §3.1 — file path token: backtick- or plain-token substrings containing at least one `/`
# or a dotted extension. Extension membership in the allowlist above is checked after the
# regex match (the regex itself is permissive; the allowlist filter narrows it).
_FILE_PATH_RE = re.compile(r"`?([\w./\-]+\.\w+|[\w\-]+/[\w./\-]+)`?")

# §3.1 — PR/issue number: `#\d+` or `PR\s*#?\d+`, case-insensitive.
_PR_NUMBER_RE = re.compile(r"PR\s*#?(\d+)|#(\d+)", re.IGNORECASE)

# §3.3/§3.1 — a gh CLI PR/issue subcommand followed by a bare number, e.g.
# `gh pr view 42`, `gh issue checkout 7`. Used target-side (§3.3) and as a fallback for
# backtick-gh-span claim-subject classification (§3.1) when `_PR_NUMBER_RE` finds no match.
_GH_COMMAND_PR_NUMBER_RE = re.compile(
    r"\bgh\s+(?:pr|issue)\s+\w+\s+(\d+)\b", re.IGNORECASE
)

# §3.1 — backtick-quoted bare identifier (function/class/var name).
_IDENTIFIER_RE = re.compile(r"^[A-Za-z_]\w*$")

# §3.1 — backtick span contents.
_BACKTICK_RE = re.compile(r"`([^`]+)`")

# §3.1 — quoted query string following search/query/grep/find (case-insensitive).
_QUOTED_QUERY_RE = re.compile(
    r"(?:search|query|grep|find)\s+\"([^\"]+)\"", re.IGNORECASE
)

# §3.1 — a gh command reference, inside a backtick span.
_GH_REFERENCE_RE = re.compile(r"\bgh\b")

# §3.3/§3.2 — word-boundary token split used for identifier exact-match-against-free-text.
_WORD_TOKEN_RE = re.compile(r"[A-Za-z_]\w*")


def _pr_number_from_text(text):
    """First PR/issue number found in `text`, or None. Used both for extraction (§3.1)
    and for target-side comparison (§3.3)."""
    m = _PR_NUMBER_RE.search(text)
    if not m:
        return None
    return m.group(1) or m.group(2)


def _extract_claim_subjects(pillar_section_text):
    """§3.1 — extract claim-subject tokens from a Pillar section's text. Returns a list of
    unique `(subject_type, value)` tuples, `subject_type` in
    {"path", "pr", "identifier", "command", "query"}. Order is not significant; dedup is
    by (type, value)."""
    if not pillar_section_text:
        return []

    subjects = []
    seen = set()

    def _add(subject_type, value):
        key = (subject_type, value)
        if key not in seen:
            seen.add(key)
            subjects.append(key)

    # Backtick spans: gh-command references, bare identifiers.
    for m in _BACKTICK_RE.finditer(pillar_section_text):
        content = m.group(1)
        if _GH_REFERENCE_RE.search(content):
            num = _pr_number_from_text(content)
            if num is None:
                gh_m = _GH_COMMAND_PR_NUMBER_RE.search(content)
                if gh_m is not None:
                    num = gh_m.group(1)
            if num is not None:
                _add("pr", num)
            else:
                _add("command", content)
        elif _IDENTIFIER_RE.match(content):
            _add("identifier", content)

    # File paths (backticked or plain), filtered by the extension allowlist for the
    # dotted-extension branch; the slash-containing branch needs no filtering (§3.1).
    for m in _FILE_PATH_RE.finditer(pillar_section_text):
        token = m.group(1)
        if "/" in token:
            _add("path", token)
        else:
            _, ext = os.path.splitext(token)
            if ext in _FILE_EXTENSION_ALLOWLIST:
                _add("path", token)

    # PR/issue numbers anywhere in the section text (prose or backticked).
    for m in _PR_NUMBER_RE.finditer(pillar_section_text):
        num = m.group(1) or m.group(2)
        _add("pr", num)

    # Quoted query strings.
    for m in _QUOTED_QUERY_RE.finditer(pillar_section_text):
        _add("query", m.group(1))

    return subjects


def _extract_tool_target(tool_name, tool_input):
    """§3.2 — the target text for a qualifying tool call, by tool name. Absent/None
    `tool_input` yields the empty string (§3.2's explicit absent-input rule)."""
    if not isinstance(tool_input, dict):
        return ""
    if tool_name in ("Read", "Edit", "Write"):
        value = tool_input.get("file_path")
        return value if isinstance(value, str) else ""
    if tool_name in ("Grep", "Glob"):
        parts = []
        path = tool_input.get("path")
        if isinstance(path, str):
            parts.append(path)
        pattern = tool_input.get("pattern")
        if isinstance(pattern, str):
            parts.append(pattern)
        return " ".join(parts)
    if tool_name == "Bash":
        value = tool_input.get("command")
        return value if isinstance(value, str) else ""
    if tool_name in ("WebSearch", "WebFetch"):
        value = tool_input.get("query")
        if isinstance(value, str):
            return value
        value = tool_input.get("url")
        return value if isinstance(value, str) else ""
    try:
        return json.dumps(tool_input)
    except Exception:
        return ""


def _subject_matches_target(subject_type, subject_value, target_text):
    """§3.3 — the matching algorithm. `target_text == ""` never matches any non-empty
    subject (§3.2's absent-input rule)."""
    if not target_text:
        return False

    if subject_type == "pr":
        # §3.3 exception: exact numeric equality only, no substring containment.
        target_num = _pr_number_from_text(target_text)
        if target_num is None:
            # Target-side only fallback: `gh pr view 42` style commands, where no
            # "#" or "PR" token immediately precedes the number.
            m = _GH_COMMAND_PR_NUMBER_RE.search(target_text)
            if m:
                target_num = m.group(1)
        return target_num is not None and target_num == subject_value

    if subject_type == "identifier":
        # §3.3 exception: exact equality only (whole target, or a whitespace/word-
        # boundary-delimited token within free-text targets).
        if subject_value == target_text:
            return True
        tokens = _WORD_TOKEN_RE.findall(target_text)
        return subject_value in tokens

    if subject_type == "path":
        # §2 — boundary-aware path-component alignment, with the basename fallback
        # retained unchanged as a second check.
        if _path_components_align(subject_value, target_text):
            return True
        if os.path.basename(subject_value) == os.path.basename(target_text):
            return True
        return False

    if subject_type == "query":
        # §3 — word/phrase-boundary-aware match.
        return _phrase_boundary_match(subject_value, target_text)

    # command — substring containment in either direction, unchanged (§4).
    if subject_value in target_text or target_text in subject_value:
        return True
    return False


def _path_components_align(subject_value, target_text):
    """§2 — a match counts only if the shorter path's component list is a contiguous
    suffix or prefix of the longer path's component list."""
    subj_parts = subject_value.split("/")
    targ_parts = target_text.split("/")
    if len(subj_parts) <= len(targ_parts):
        shorter, longer = subj_parts, targ_parts
    else:
        shorter, longer = targ_parts, subj_parts
    if not shorter:
        return False
    n = len(shorter)
    # suffix alignment: shorter matches the tail of longer's components
    if longer[len(longer) - n:] == shorter:
        return True
    # prefix alignment: shorter matches the head of longer's components
    if longer[:n] == shorter:
        return True
    return False


def _phrase_boundary_match(subject_value, target_text):
    """§3 — containment counts as a match only at a word/phrase boundary (no
    alphanumeric character immediately adjacent on either side of the match)."""
    for shorter, longer in ((subject_value, target_text), (target_text, subject_value)):
        if not shorter:
            continue
        pattern = r"(?<!\w)" + re.escape(shorter) + r"(?!\w)"
        if re.search(pattern, longer):
            return True
    return False


def _collect_qualifying_tool_calls(preceding):
    """Shared collection of completed, non-excluded tool calls from `preceding` records —
    returns a list of `(name, input)` tuples."""
    tool_use_info = {}
    tool_result_ids = set()
    for r in preceding:
        message = r.get("message")
        if not isinstance(message, dict):
            continue
        content = message.get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if not isinstance(block, dict):
                continue
            btype = block.get("type")
            if btype == "tool_use":
                tool_id = block.get("id")
                if tool_id:
                    tool_use_info[tool_id] = (block.get("name"), block.get("input"))
            elif btype == "tool_result":
                tool_id = block.get("tool_use_id")
                if tool_id:
                    tool_result_ids.add(tool_id)

    return [
        info
        for tool_id, info in tool_use_info.items()
        if tool_id in tool_result_ids and info[0] not in C3_EXCLUDED_TOOLS
    ]


def check_c3_violation(records, current_turn_index, pillar_idx, pillar_section_text):
    """§5.4/§3.3 — applies only if a Pillar heading was asserted (`pillar_idx is not
    None`). Returns `(violation: bool, unmatched_subjects: list)`. `unmatched_subjects` is
    the list of `(subject_type, value)` claim subjects that had no matching qualifying
    tool call — populated only for the "qualifying calls exist but some subject(s)
    unmatched" case (§4), empty otherwise (including the pure-absence and presence-only-
    fallback cases)."""
    if pillar_idx is None:
        return False, []

    if current_turn_index is None:
        preceding = records
    else:
        preceding = records[:current_turn_index]

    qualifying = _collect_qualifying_tool_calls(preceding)
    if not qualifying:
        return True, []

    subjects = _extract_claim_subjects(pillar_section_text)
    if not subjects:
        # §3.4 — presence-only fallback: qualifying calls exist, so C3 passes.
        return False, []

    targets = [_extract_tool_target(name, tool_input) for name, tool_input in qualifying]

    unmatched = [
        (subject_type, value)
        for subject_type, value in subjects
        if not any(
            _subject_matches_target(subject_type, value, target) for target in targets
        )
    ]
    return len(unmatched) > 0, unmatched


def build_reason(
    violations, signpost_idx, pillar_idx, pillar_line, c2_line, c3_unmatched_subjects=None
):
    parts = []
    if "C1" in violations:
        quoted = pillar_line if pillar_line else "(Pillar heading)"
        parts.append(
            f"C1 violation: a Pillar heading was found with no preceding Signpost "
            f"heading (quoted: \"{quoted}\"). Re-emit the turn with Signpost before "
            f"Pillar."
        )
    if "C2" in violations:
        parts.append(
            f"C2 violation: forbidden third section found (quoted: \"{c2_line}\"). "
            f"Remove the third section; if a claim is genuinely unverifiable, report it "
            f"as a BLOCKER, not a to-do."
        )
    if "C3" in violations:
        quoted = pillar_line if pillar_line else "(Pillar heading)"
        if c3_unmatched_subjects:
            named = ", ".join(f"`{value}`" for _subject_type, value in c3_unmatched_subjects)
            parts.append(
                f"C3 violation: a Pillar heading was asserted (quoted: \"{quoted}\") "
                f"whose claimed subject(s) ({named}) do not match any qualifying tool "
                f"call recorded before it — the qualifying call(s) present target "
                f"something else. Run the verifying tool call(s) for these specific "
                f"claims before reporting them."
            )
        else:
            parts.append(
                f"C3 violation: a Pillar heading was asserted (quoted: \"{quoted}\") with "
                f"no qualifying tool call recorded before it in the transcript. Run the "
                f"verifying tool call(s) for the Pillar claims before reporting them."
            )
    return " ".join(parts)


def write_track_record(session_id, stop_hook_active, queue_injected, first_turn,
                        decision, violations, reason, probe_error):
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "session_id": session_id,
        "stop_hook_active": bool(stop_hook_active),
        "queue_injected": bool(queue_injected),
        "first_turn": bool(first_turn),
        "decision": decision,
        "violations": violations,
        "reason": reason,
        "probe_error": probe_error,
    }
    try:
        os.makedirs(os.path.dirname(TRACK_RECORD_PATH), exist_ok=True)
        with open(TRACK_RECORD_PATH, "a") as fh:
            fh.write(json.dumps(entry) + "\n")
    except Exception:
        # The track record is an audit trail, not a gate — a write failure here must not
        # change or block the probe's decision to Claude Code.
        pass


def emit_block(reason):
    print(json.dumps({"decision": "block", "reason": reason}))


def emit_allow():
    # §3.2 — silence-means-allow; emitting nothing is equivalent to `{}`.
    pass


def run(stdin_data):
    session_id = stdin_data.get("session_id")
    transcript_path = stdin_data.get("transcript_path")
    stop_hook_active = bool(stdin_data.get("stop_hook_active", False))
    last_assistant_message = stdin_data.get("last_assistant_message") or ""

    # §4.1 — checked first, before any check runs. Always allow.
    if stop_hook_active:
        write_track_record(session_id, True, False, False, "allow", [], None, None)
        emit_allow()
        return

    records = load_transcript_records(transcript_path)
    queue_injected, first_turn, current_turn_index = (
        analyze_queue_injection_and_first_turn(records)
    )

    if not queue_injected:
        write_track_record(session_id, False, False, False, "allow", [], None, None)
        emit_allow()
        return

    if not first_turn:
        write_track_record(session_id, False, True, False, "allow", [], None, None)
        emit_allow()
        return

    signpost_idx, pillar_idx = find_signpost_pillar_positions(last_assistant_message)
    c1_violation = pillar_idx is not None and (
        signpost_idx is None or pillar_idx < signpost_idx
    )
    c2_line = find_c2_heading_line(last_assistant_message)
    c2_violation = c2_line is not None
    pillar_section_text = None
    if pillar_idx is not None:
        lines = last_assistant_message.split("\n")
        section_end = len(lines)
        for idx in range(pillar_idx + 1, len(lines)):
            stripped = strip_leading_markup(lines[idx])
            if _SIGNPOST_PILLAR_HEADING_RE.match(stripped):
                section_end = idx
                break
        pillar_section_text = "\n".join(lines[pillar_idx:section_end])
    c3_violation, c3_unmatched_subjects = check_c3_violation(
        records, current_turn_index, pillar_idx, pillar_section_text
    )

    violations = []
    if c1_violation:
        violations.append("C1")
    if c2_violation:
        violations.append("C2")
    if c3_violation:
        violations.append("C3")

    if violations:
        pillar_line = find_pillar_heading_line(last_assistant_message, pillar_idx)
        reason = build_reason(
            violations, signpost_idx, pillar_idx, pillar_line, c2_line,
            c3_unmatched_subjects,
        )
        write_track_record(session_id, False, True, True, "block", violations, reason, None)
        emit_block(reason)
        return

    write_track_record(session_id, False, True, True, "allow", [], None, None)
    emit_allow()


def main():
    stdin_data = read_stdin()
    try:
        run(stdin_data)
    except Exception as exc:  # noqa: BLE001 — this probe must never crash into a block
        write_track_record(
            stdin_data.get("session_id"),
            stdin_data.get("stop_hook_active", False),
            False,
            False,
            "probe_error",
            [],
            None,
            f"{exc.__class__.__name__}: {exc}",
        )
        emit_allow()
    return 0


if __name__ == "__main__":
    sys.exit(main())
