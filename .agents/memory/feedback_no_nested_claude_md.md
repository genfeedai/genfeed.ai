---
name: no nested claude md
description: Only the repo-root CLAUDE.md is allowed
type: feedback
---

# No nested CLAUDE.md

The only `CLAUDE.md` in this repo is the file at the repository root. Do not
add `CLAUDE.md` under `apps/*` or `packages/*`.

**Why:** Nested copies were a Claude Code context-budget trick. Cursor and
Codex already load `.agents/memory/` from the root. Package-local rules belong
in `.agents/memory/`, not a second instruction file Next or a subdirectory
walk can mutate.

**How to apply:**

- Delete any new `apps/**/CLAUDE.md` or `packages/**/CLAUDE.md`.
- Put package-specific rules in `.agents/memory/` and index them in
  `MEMORY.md`.
- Keep `agentRules: false` so `next dev` cannot recreate one.
