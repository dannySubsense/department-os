"""File discovery for spec-doc-checker.

Section 3, "Input": non-recursive discovery of all `*.md` files directly
inside the target directory.
"""

from __future__ import annotations

from pathlib import Path
from typing import List

from .config import ConfigError


def discover_files(target_dir: Path) -> List[Path]:
    """Return sorted list of `*.md` files directly inside target_dir.

    Raises ConfigError (exit code 2) if target_dir does not exist or is not
    readable. An existing, readable, empty-of-.md-files directory returns an
    empty list — that is exit code 0 with files_checked: 0 (Section 7 AC 11),
    not an error.
    """
    if not target_dir.exists():
        raise ConfigError(f"target directory does not exist: {target_dir}")
    if not target_dir.is_dir():
        raise ConfigError(f"target path is not a directory: {target_dir}")
    try:
        entries = list(target_dir.iterdir())
    except OSError as exc:
        raise ConfigError(f"target directory is not readable: {target_dir}: {exc}")
    files = sorted(p for p in entries if p.is_file() and p.suffix == ".md")
    return files
