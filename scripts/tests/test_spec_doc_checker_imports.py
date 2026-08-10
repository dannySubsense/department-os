"""Direct-import regression coverage for spec_doc_checker (N6 fix).

All other tests in this suite drive the tool via subprocess (full CLI
invocations), so none of them ever directly `import` the package -- which
made the models.py <-> rules.py circular-import bug (N6) invisible to the
test suite. These tests close that structural gap by importing each
submodule directly, including as the very first import of the interpreter
(via a subprocess running a one-line `python3 -c "import X"`), so import
order can never mask a regression.
"""

from __future__ import annotations

import subprocess
import sys

MODULES = [
    "spec_doc_checker.rules",
    "spec_doc_checker.models",
    "spec_doc_checker.cli",
    "spec_doc_checker.config",
    "spec_doc_checker.discovery",
    "spec_doc_checker.output",
    "spec_doc_checker.suppression",
]


def test_rules_imports_directly_in_process():
    import spec_doc_checker.rules  # noqa: F401


def test_models_imports_directly_in_process():
    import spec_doc_checker.models  # noqa: F401


def _import_as_first_import(module_name: str) -> None:
    """Run `import <module_name>` as the very first statement in a fresh
    interpreter, so no other module in the package can have already been
    partially or fully initialized first. This is the only way to
    genuinely exercise import-order independence.
    """
    result = subprocess.run(
        [sys.executable, "-c", f"import {module_name}"],
        cwd=__import__("pathlib").Path(__file__).resolve().parent.parent,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"import {module_name} as first import failed:\n"
        f"stdout: {result.stdout}\nstderr: {result.stderr}"
    )


def test_rules_module_importable_as_first_import():
    _import_as_first_import("spec_doc_checker.rules")


def test_models_module_importable_as_first_import():
    _import_as_first_import("spec_doc_checker.models")


def test_every_module_importable_as_first_import():
    for module_name in MODULES:
        _import_as_first_import(module_name)
