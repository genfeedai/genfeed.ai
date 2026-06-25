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
- `.claude/skills/` — symlinks to `../../.agents/skills/<name>` ONLY.

## Rules

- **Never** create symlinks pointing outside `genfeed.ai/`
- **Never** link to `~/`, `~/.agents/`, `~/www/shipshitdev/`, or any external path
- `.claude/skills/` exists purely for Claude Code discovery — source of truth is `.agents/skills/`

## Origin

2026-04-21: Vincent corrected after I created `.claude/skills/` symlinks pointing to `~/www/shipshitdev/`. Open source = every contributor must clone and go.
