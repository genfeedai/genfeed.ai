---
created: 2026-04-21
last_verified: 2026-04-21
type: feedback
status: permanent
---

# No External Symlinks in Open Source Repo

This is an open source project. Every path must resolve within the monorepo.

## Structure

- `skills/` — product/content skills (used by the app). Real files.
- `.agents/skills/` — dev/build skills (for building the app). Real files.
- `.agents/memory/` — the memory tree this file lives in. Real files.
- Per-agent dirs (`.claude/`, `.codex/`) hold only internal symlinks back into
  `.agents/` — e.g. `.claude/memory -> ../.agents/memory`, `.claude/rules ->
  ../.agents/memory/rules`, `.codex/memory -> ../.agents/memory`, `.codex/skills
  -> ../.agents/skills`. (Verified 2026-09-28: `.claude/skills/` no longer
  exists — the set of symlinks an agent dir carries can change, but every
  target must still resolve inside `genfeed.ai/`.)

## Rules

- **Never** create symlinks pointing outside `genfeed.ai/`
- **Never** link to `~/`, `~/.agents/`, `~/www/shipshitdev/`, or any external path
- `.claude/skills/` exists purely for Claude Code discovery — source of truth is `.agents/skills/`

## Origin

2026-04-21: Vincent corrected after I created `.claude/skills/` symlinks pointing to `~/www/shipshitdev/`. Open source = every contributor must clone and go.
