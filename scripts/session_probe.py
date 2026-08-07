#!/usr/bin/env python3
"""
scripts/session_probe.py — Session-start ground-truth probe.

Prints the LIVE state of the repo in a few seconds so a new session builds its
mental model on ground truth, not on inherited narrative. Operational half of
the "Signpost, not pillar" discipline (see CLAUDE.md Session Start Behaviour,
and market_data/docs/reports/POSTMORTEM-2026-06-29-v1-dead-code-and-false-alarm.md
for the origin doctrine): memory tells you where to look; THIS tells you what
is actually true right now.

Wired to run automatically via the SessionStart hook (.claude/settings.json) —
not a manual "run this first" instruction. Read-only: never writes the repo.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def _run(cmd: list[str]) -> str:
    try:
        return subprocess.run(
            cmd, cwd=REPO, capture_output=True, text=True, timeout=15
        ).stdout.strip()
    except Exception as exc:  # noqa: BLE001
        return f"<error: {exc}>"


def section(title: str) -> str:
    return f"\n── {title} {'─' * max(0, 56 - len(title))}"


def main() -> None:
    out = []

    out.append(section("Git"))
    branch = _run(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    ahead_behind = _run(["git", "status", "-sb", "--porcelain=2"])
    local_head = _run(["git", "rev-parse", "HEAD"])[:12]
    dirty = _run(["git", "status", "--porcelain"])
    out.append(f"branch={branch} HEAD={local_head}")
    out.append(f"dirty files: {len(dirty.splitlines()) if dirty else 0}")
    if dirty:
        out.append(dirty)
    out.append(ahead_behind or "<no upstream tracking info>")

    out.append(section("Recent commits"))
    out.append(_run(["git", "log", "--oneline", "-8"]))

    out.append(section("Uncommitted / untracked (git status -uno already above; full below)"))
    out.append(_run(["git", "status"]))

    out.append(section("Docs present"))
    docs_dir = REPO / "docs"
    if docs_dir.exists():
        for p in sorted(docs_dir.rglob("*.md")):
            out.append(str(p.relative_to(REPO)))
    else:
        out.append("<no docs/ directory>")

    print("\n".join(out))


if __name__ == "__main__":
    main()
