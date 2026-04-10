---
name: GitHub issue worktree workflow
description: Assigned GitHub issues must be implemented in isolated worktrees from develop, then PR to develop, run CI, and merge
type: feedback
status: active
last_verified: 2026-04-10
topics: [workflow, git, worktrees, github]
---

**Rule:** When Vincent assigns a GitHub issue for implementation, create and work in an isolated git worktree branched from `develop`.

**Why:** Vincent wants up to 5 features in flight at the same time without branch switching, workspace contamination, or cross-feature merge conflicts. The expected delivery path is issue -> worktree -> feature branch -> PR to `develop` -> CI -> merge.

**How to apply:**
- For every assigned GitHub issue, start from the main repo checkout and create a worktree from the current `develop` branch.
- Use a feature branch named from the issue, for example `feat/123-short-title` or `fix/123-short-title`.
- Keep all code edits, tests, commits, and agent/subagent work for that issue inside that worktree.
- Tell any spawned coding agents to operate inside the issue worktree only and not touch the main checkout or other feature worktrees.
- Before opening a PR, run the narrowest relevant checks first, then the repo's required pre-push gates when feasible.
- Open the PR against `develop`, not `staging` or `master`.
- After PR creation, inspect CI, fix failures in the same worktree/branch, push updates, and repeat until CI is green.
- Merge only through the approved GitHub PR path. Never direct-push to `develop`, `staging`, or `master`.
- Preserve the existing release promotion flow after `develop`: `develop` -> `staging` -> `master`, always via PR.
