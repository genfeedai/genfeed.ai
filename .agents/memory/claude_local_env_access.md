---
name: claude_local_env_access
description: Claude Code may Read/Edit local `.env*`; deny stays on secrets/ and key files
type: project
---

# Claude local `.env*` access

**Why:** Operators sometimes need Claude to read/write real local env (including production credentials) for deploy/debug. A project `deny` on `Read(**/.env*)` / `Edit(**/.env*)` blocked that, and **deny wins at every settings level** — user global allow and `.claude/settings.local.json` allow cannot override it.

**How to apply:**
- Shared `.claude/settings.json` must **not** deny `.env*` Read/Edit/Write.
- Keep deny on `Read(**/*.pem)` and `Read(**/secrets/**)`.
- Bash PreToolUse `block-sensitive-access.py` may allow `.env*` reads; still block `secrets/`, `.pem`, and private-key paths.
- Never commit `.env*` contents (trunk secret-scan rule still applies).
- Scope: **project** (this repo’s `.claude/`), not `~/.claude/settings.json`. Worktrees on the same branch see the same file.
