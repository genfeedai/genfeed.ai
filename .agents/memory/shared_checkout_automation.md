---
name: Concurrent automation commits and pushes in this shared checkout
description: Shared checkout automation can move HEAD; path-scope staging and recheck git state
type: feedback
status: active
last_verified: 2026-06-15
topics: [workflow, git, automation, shared-checkout]
---

**Rule:** Treat a shared checkout as a moving target when background automation is active. Recheck git state before staging, committing, or pushing.

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
