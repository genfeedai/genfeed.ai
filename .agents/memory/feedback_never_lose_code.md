---
name: Never lose uncommitted code
description: Always branch and push uncommitted WIP before destructive git operations — learned from near-loss of 128-file Epic #95 work
type: feedback
---

NEVER discard, reset, or clean uncommitted changes without first preserving them on a pushed branch.

**Why:** Nearly lost 128 files of Epic #95 self-hosted decoupling work. The WIP was sitting as local edits (never committed), and `git checkout -- .` + `git clean -fd` wiped it. Recovered from unreachable stash objects via `git fsck`, but that's not guaranteed.

**How to apply:**
- Before any `git stash pop`, `git checkout -- .`, `git clean`, or `git reset`: check if there are uncommitted changes and commit them to a branch first
- If stash pop conflicts, do NOT drop the stash — resolve conflicts or re-stash
- Large WIP (10+ files) should always be on a pushed branch, never just local edits
- When encountering uncommitted changes at session start, ask the user before touching them
