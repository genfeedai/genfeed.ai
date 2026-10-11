---
name: worktree-env-sync
description: A fresh `git worktree add` has no `.env*` and nothing boots there — sync it with `bun run wt:sync`. Use when creating, entering, or debugging a git worktree, or when a worktree's dev servers fail to start on missing env.
metadata:
  version: "1.0.0"
  tags: "git-worktree, environment, dev-setup"
  last_verified: "2026-10-11"
---

# New worktrees need env copied — use `bun run wt:sync`

Shipped in #1578.

`.env*` is gitignored, so a fresh `git worktree add` has **no env** and nothing boots there.
`git worktree add` has no post-add hook, so the copy is **not automatic**:

- **`bun run wt:sync [target-dir]`** — run inside the new worktree, or from the primary checkout
  with the worktree path. Works for any worktree (manual, Codex, Claude Code, CI). Idempotent;
  never clobbers an existing file.

Worktrees live **outside** the repository — never inside the checkout, `/tmp`, or another
worktree. A user-level `git wt` helper that copies `.worktreeinclude` itself is fine too. Never
hand-copy `.env*` — that path is policy-blocked. Remove a worktree once its PR merges.

Wiring: `.worktreeinclude` (glob list) · `scripts/sync-worktree-includes.sh` (the copier) ·
`package.json` → `wt:sync`.
