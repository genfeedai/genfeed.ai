#!/usr/bin/env python3
"""PostToolUse bridge to the canonical Prisma tenant-scope guard.

The TypeScript guard owns tenant-model discovery, query analysis, suppressions,
and baseline semantics. This hook only filters irrelevant edits, resolves the
edited file's worktree, and translates an actionable guard failure into the
PostToolUse exit-2 contract.

Malformed hook input and unavailable local tooling fail open. Pull-request CI
remains the authoritative enforcement boundary.
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional


GUARD_COMMAND = ("bun", "run", "check:tenant-scope")
GUARD_TIMEOUT_SECONDS = 30
MAX_OUTPUT_LINES = 40
SCAN_ROOTS = (
    Path("apps/server/api/src"),
)
IGNORED_DIRECTORY_NAMES = {
    "__fixtures__",
    ".next",
    ".turbo",
    "coverage",
    "dist",
    "fixtures",
    "generated",
    "node_modules",
}


def read_edited_path() -> Optional[str]:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, TypeError, ValueError):
        return None

    if not isinstance(payload, dict):
        return None

    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        return None

    file_path = tool_input.get("file_path")
    return file_path if isinstance(file_path, str) and file_path else None


def absolute_edited_path(file_path: str) -> Path:
    candidate = Path(file_path).expanduser()
    if candidate.is_absolute():
        return candidate.resolve()

    project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))
    return (project_dir / candidate).resolve()


def resolve_worktree_root(file_path: Path) -> Optional[Path]:
    try:
        result = subprocess.run(
            [
                "git",
                "-C",
                str(file_path.parent),
                "rev-parse",
                "--show-toplevel",
            ],
            capture_output=True,
            check=False,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return None

    if result.returncode != 0 or not result.stdout.strip():
        return None

    return Path(result.stdout.strip()).resolve()


def is_scanned_source(file_path: Path, worktree_root: Path) -> bool:
    try:
        relative_path = file_path.relative_to(worktree_root)
    except ValueError:
        return False

    normalized = relative_path.as_posix()
    if (
        not normalized.endswith(".ts")
        or normalized.endswith(".spec.ts")
        or normalized.endswith(".test.ts")
        or any(part in IGNORED_DIRECTORY_NAMES for part in relative_path.parts)
    ):
        return False

    for scan_root in SCAN_ROOTS:
        try:
            relative_path.relative_to(scan_root)
            return True
        except ValueError:
            continue

    return False


def output_tail(stdout: str, stderr: str) -> str:
    lines = [*stdout.splitlines(), *stderr.splitlines()]
    return "\n".join(lines[-MAX_OUTPUT_LINES:])


def run_guard(worktree_root: Path) -> int:
    if shutil.which(GUARD_COMMAND[0]) is None:
        return 0

    try:
        result = subprocess.run(
            GUARD_COMMAND,
            capture_output=True,
            check=False,
            cwd=worktree_root,
            text=True,
            timeout=GUARD_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.SubprocessError):
        return 0

    if result.returncode == 0:
        return 0

    details = output_tail(result.stdout, result.stderr)
    print(
        "BLOCKED by .claude/hooks/check-tenant-scope.py: "
        "the canonical Prisma tenant-scope guard failed after this edit.",
        file=sys.stderr,
    )
    if details:
        print(details, file=sys.stderr)
    return 2


def main() -> int:
    edited_path = read_edited_path()
    if not edited_path:
        return 0

    file_path = absolute_edited_path(edited_path)
    if not file_path.is_file():
        return 0

    worktree_root = resolve_worktree_root(file_path)
    if worktree_root is None or not is_scanned_source(file_path, worktree_root):
        return 0

    return run_guard(worktree_root)


if __name__ == "__main__":
    raise SystemExit(main())
