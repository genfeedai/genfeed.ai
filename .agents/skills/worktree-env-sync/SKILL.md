---
name: worktree-env-sync
description: A fresh `git worktree add` has no `.env*` and nothing boots there — sync it with `git wt` or `bun run wt:sync`. Use when creating, entering, or debugging a git worktree, or when a worktree's dev servers fail to start on missing env.
metadata:
  version: "1.0.0"
  tags: "git-worktree, environment, dev-setup"
  last_verified: "2026-07-26"
---

# New worktrees need env copied — use `git wt` or `bun run wt:sync`

Shipped in #1578.

`.env*` is gitignored, so a fresh `git worktree add` has **no env** and nothing boots there.
`git worktree add` has no post-add hook, so the copy is **not automatic**. Do one of:

- **`git wt <name> [branch]`** — adds `<repo>/.worktrees/<name>` and syncs env in one step (needs
  the one-time `bun run wt:setup`, which installs the `wt` git alias). A bare name is the whole
  path; `git wt` refuses anything that is not a direct child of `.worktrees/` (or the
  harness-owned `.claude/worktrees/`), so worktrees never nest and never land in `/tmp`,
  sibling dirs, or `$HOME`.
- **`bun run wt:sync [target-dir]`** — run after any `git worktree add`, including Codex/CI
  worktrees. Idempotent; never clobbers an existing file.

Rule of thumb: prefer `git wt <name>`. If you must `git worktree add` by hand, the path is
`<repo>/.worktrees/<name>` and you immediately `bun run wt:sync <path>`. Never hand-copy
`.env*` — that path is policy-blocked. Worktrees stay after their PR merges (follow-ups happen
there); remove them only when the branch is truly done.

Wiring: `.worktreeinclude` (glob list) · `scripts/sync-worktree-includes.sh` (the copier) ·
`package.json` → `wt:sync`, `wt:setup`.
