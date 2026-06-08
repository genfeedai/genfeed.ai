---
name: Concurrent automation commits and pushes develop in this shared checkout
description: A background automation (codex feature-impl + a deps-update bot) commits to HEAD and pushes develop; feature branches do not isolate it
type: feedback
---

**Observed:** 2026-06-03. During an interactive session, a background automation
repeatedly committed to whatever branch was checked out and pushed `origin/develop`
without the interactive agent acting. Commits seen interleaved with the agent's:
`473613a00` (chore deps bump), `f1aa801f0` / `c8e441673` / `6c021339c` (feat UI
Container integration, settings/sidebar). It also pushed the agent's local-only
commits to origin as a side effect.

**Why it matters:**
- `develop` is actively contended. `git status` / `ahead/behind` shifts between
  tool calls. Treat the working tree + branch tips as moving.
- A feature branch does NOT isolate you — the automation commits to the current
  HEAD in the SAME checkout, so it can land commits on your `feat/*` too.
- Local-only commits may get pushed to origin by the automation regardless of a
  "no push" instruction.

**How to apply:**
- NEVER `git add -u` / `git add -A` blindly — path-scope every stage to your own
  files (e.g. `git add apps/server/api`) so you don't sweep the automation's WIP.
- Re-check `git log`/`git status` right before committing; don't assume the tip.
- Before destructive git ops, confirm what's actually in the tree (it may be the
  automation's, not yours).
- "no push" for develop is best-effort — the automation may push it anyway.
