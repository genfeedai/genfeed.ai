#!/usr/bin/env python3
"""PreToolUse guard for Bash tool calls in genfeed.ai.

Deterministically enforces working agreements that used to live only as prose:
  1. Trunk is PR-only — no pushes to master/main.
  2. Bun only — npm/npx/yarn/pnpm are blocked.
  3. No `vercel` without an existing .vercel/project.json link.
  4. .env* files never get staged or committed (public repo) — except the
     committed placeholder templates (.env.example and friends).

Contract: stdin receives {"tool_name","tool_input":{"command"}}. Exit 2 blocks
the call and feeds stderr back to the agent so it can self-correct.
Fail-open on parse/subprocess errors — a broken hook must never brick the shell.
"""

import json
import os
import re
import subprocess
import sys


# Matches only at command position (start of string or after && || ; | \( ),
# so quoted mentions — commit messages, PR bodies — don't false-positive.
COMMAND_POSITION = r"(?:^|&&|\|\||[;|(])\s*"

# Placeholder templates are the documented shape of an env file, carry no
# values, and are tracked on purpose — .env.example, .env.local.example,
# .env.sample, .env.template. Blocking them meant a var could be deleted from
# the schema but never from the file contributors copy.
ENV_TEMPLATE_SUFFIXES = (".example", ".sample", ".template", ".dist")


def is_env_secret_path(path: str) -> bool:
    """True for an env file that could carry real values, False for a template."""
    basename = path.rsplit("/", 1)[-1].strip("\"'")
    if not basename.startswith(".env"):
        return False
    return not basename.endswith(ENV_TEMPLATE_SUFFIXES)


def block(message: str) -> None:
    print(f"BLOCKED by .claude/hooks/pre-bash-guard.py: {message}", file=sys.stderr)
    sys.exit(2)


def git(project_dir: str, *args: str) -> str:
    try:
        result = subprocess.run(
            ["git", "-C", project_dir, *args],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return

    tool_input = payload.get("tool_input") or {}
    command = tool_input.get("command") or ""
    if not command:
        return

    project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()

    # Command rules (1–4) match with quoted spans blanked out, so commit
    # messages / PR bodies that *mention* forbidden commands don't trip them.
    # The .env rules (5) keep the raw string: `git add ".env"` must still match.
    sanitized = re.sub(r"\"[^\"]*\"|'[^']*'", '""', command)

    # 1. Trunk protection — no pushes to master/main, ever.
    if re.search(COMMAND_POSITION + r"git\b[^;&|]*\bpush\b", sanitized):
        push_tail = re.search(r"\bpush\b([^;&|]*)", sanitized).group(1).split()
        refspecs = [
            arg
            for arg in push_tail
            if not arg.startswith("-") and arg not in ("origin", "upstream")
        ]
        # A refspec targets trunk if it IS master/main or its destination
        # (`src:dest`) is — exact token match, so feat/master-fix stays pushable.
        for refspec in refspecs:
            destination = refspec.rsplit(":", 1)[-1].removeprefix("refs/heads/")
            if destination in ("master", "main"):
                block(
                    "pushing master/main is forbidden — trunk is PR-only. "
                    "Push a feature branch and open a PR to master."
                )
        if not refspecs and git(project_dir, "symbolic-ref", "--short", "HEAD") in (
            "master",
            "main",
        ):
            block(
                "bare `git push` while checked out on trunk would push master/main. "
                "Create a feature branch first."
            )

    # 2. Bun only — block npm/npx/yarn/pnpm in command position.
    package_manager = re.search(
        COMMAND_POSITION + r"(npm|npx|yarn|pnpm)\b", sanitized
    )
    if package_manager:
        block(
            f"`{package_manager.group(1)}` is forbidden in this workspace — "
            "use `bun` / `bunx` instead (bun-not-npm rule)."
        )

    # 3. Vercel deploys require an existing project link.
    if re.search(COMMAND_POSITION + r"(?:bunx\s+)?vercel\b", sanitized):
        if not os.path.isfile(os.path.join(project_dir, ".vercel", "project.json")):
            block(
                "`vercel` without .vercel/project.json — STOP. Do not run "
                "`vercel link` unattended; ask Vincent first (www/CLAUDE.md rule)."
            )

    # 4. .env* never staged or committed — this repo is public. Placeholder
    # templates (.env.example and friends) are exempt: they hold no values and
    # are already tracked, so keeping them editable is the safe behaviour.
    add_command = re.search(COMMAND_POSITION + r"git\b[^;&|]*\badd\b([^;&|]*)", command)
    if add_command:
        secret_args = [
            arg
            for arg in re.findall(r"\S*\.env\S*", add_command.group(1))
            if is_env_secret_path(arg)
        ]
        if secret_args:
            block(
                f"staging env files ({', '.join(secret_args)}) is forbidden — "
                "never commit env files (public repo; a leak is indexed before "
                "rotation). Placeholder templates like .env.example are allowed."
            )
    if re.search(COMMAND_POSITION + r"git\b[^;&|]*\bcommit\b", command):
        staged = git(project_dir, "diff", "--cached", "--name-only")
        env_files = [
            line
            for line in staged.splitlines()
            if re.search(r"(^|/)\.env", line) and is_env_secret_path(line)
        ]
        if env_files:
            block(
                f"staged files include env files ({', '.join(env_files)}) — "
                "unstage them before committing (`git restore --staged <file>`)."
            )


if __name__ == "__main__":
    main()
