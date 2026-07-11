# New worktrees need env files copied — use `git wt` or `bun run wt:sync`

**last_verified: 2026-07-11**

Env files (`.env*`) are gitignored, so a fresh `git worktree add` starts with
**no env** and the app/API won't boot there. `.worktreeinclude` lists the globs
to copy from the primary worktree; `scripts/sync-worktree-includes.sh` does the
copy (idempotent — never clobbers an existing file in the target).

## For agents (Claude, Codex) creating worktrees

`git worktree add` has **no post-add hook**, so the sync is NOT automatic for a
plain `git worktree add`. Do one of:

- **`git wt <path> [branch]`** — wrapper alias that runs `git worktree add` then
  syncs env in one step. Requires the one-time `bun run wt:setup` (installs the
  `wt` git alias for the current user).
- **`bun run wt:sync [target-dir]`** — run manually after any `git worktree add`
  (or after a Codex/CI worktree is created). Copies the `.worktreeinclude`
  globs into the target. Safe to re-run.

Rule of thumb: **if you `git worktree add`, immediately `bun run wt:sync <path>`**
(or use `git wt` instead of `git worktree add`). Do not hand-copy `.env*` files —
that path is policy-blocked and error-prone.

## Wiring

- `.worktreeinclude` — glob list (repo root).
- `scripts/sync-worktree-includes.sh` — the copier (target-dir arg optional).
- `package.json` → `wt:sync` (copier) and `wt:setup` (installs `git wt` alias).
- Shipped in **#1578**.
