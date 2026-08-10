#!/usr/bin/env python3
"""Entry point for the spec-doc-checker tool.

See docs/tooling/spec-doc-checker.md (LOCKED) for the normative spec.

Usage:
    python3 scripts/check-spec-docs.py <path> [--config <path>] \
        [--rule <name>]... [--format text|json] [--strict]
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from spec_doc_checker.cli import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
