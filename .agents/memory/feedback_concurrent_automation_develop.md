---
name: Concurrent automation commits and pushes in this shared checkout
description: A background automation (codex feature-impl + a deps-update bot) commits to HEAD and pushes the shared checkout; short-lived branches do not isolate it
type: feedback
status: active
last_verified: 2026-06-15
topics: [workflow, git, automation, shared-checkout]
---

**Observed:** 2026-06-03 (pre-trunk migration, against the then-`develop` branch).
During an interactive session, a background automation repeatedly committed to
whatever branch was checked out and pushed the shared mainline without the
interactive agent acting. Commits seen interleaved with the agent's: `473613a00`
(chore deps bump), `f1aa801f0` / `c8e441673` / `6c021339c` (feat UI Container
integration, settings/sidebar). It also pushed the agent's local-only commits to
origin as a side effect. The repo is now trunk-based (`master` is the single
trunk, PR-only), but the shared-checkout contention pattern is durable.

**Why it matters:**
- The shared checkout is actively contended. `git status` / `ahead/behind` shifts
  between tool calls. Treat the working tree + branch tips as moving.
- A short-lived branch does NOT isolate you — the automation commits to the
  current HEAD in the SAME checkout, so it can land commits on your `feat/*` too.
- Local-only commits may get pushed to origin by the automation regardless of a
  "no push" instruction.

**How to apply:**
- NEVER `git add -u` / `git add -A` blindly when sharing a checkout with the
  automation — path-scope every stage to your own files (e.g. `git add apps/server/api`)
  so you don't sweep the automation's WIP. (In an isolated worktree of your own,
  `git add -A` is fine.)
- Re-check `git log`/`git status` right before committing; don't assume the tip.
- Before destructive git ops, confirm what's actually in the tree (it may be the
  automation's, not yours).
- "no push" is best-effort in a shared checkout — the automation may push anyway.
