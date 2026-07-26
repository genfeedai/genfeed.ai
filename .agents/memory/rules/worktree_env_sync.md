# New worktrees need env copied — use `git wt` or `bun run wt:sync`

**last_verified: 2026-07-26** · Shipped in #1578

`.env*` is gitignored, so a fresh `git worktree add` has **no env** and nothing boots there.
`git worktree add` has no post-add hook, so the copy is **not automatic**. Do one of:

- **`git wt <path> [branch]`** — adds the worktree and syncs env in one step (needs the one-time
  `bun run wt:setup`, which installs the `wt` git alias).
- **`bun run wt:sync [target-dir]`** — run after any `git worktree add`, including Codex/CI
  worktrees. Idempotent; never clobbers an existing file.

Rule of thumb: if you `git worktree add`, immediately `bun run wt:sync <path>`. Never hand-copy
`.env*` — that path is policy-blocked.

Wiring: `.worktreeinclude` (glob list) · `scripts/sync-worktree-includes.sh` (the copier) ·
`package.json` → `wt:sync`, `wt:setup`.
