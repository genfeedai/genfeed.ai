---
name: GitHub issue worktree workflow
description: Assigned GitHub issues must be implemented in isolated worktrees from master, then PR to master, run CI, and merge
type: feedback
status: active
last_verified: 2026-06-15
topics: [workflow, git, worktrees, github]
---

**Rule:** When Vincent assigns a GitHub issue for implementation, create and work in an isolated git worktree branched from `master` (the trunk).

**Why:** Vincent wants up to 5 features in flight at the same time without branch switching, workspace contamination, or cross-feature merge conflicts. Trunk-based delivery path: issue -> worktree off `master` -> short-lived branch -> PR to `master` -> CI -> merge.

**How to apply:**
- For every assigned GitHub issue, start from the main repo checkout and create a worktree from the current `master` branch.
- Use a short-lived branch named from the issue, for example `feat/123-short-title` or `fix/123-short-title`.
- Keep all code edits, tests, commits, and agent/subagent work for that issue inside that worktree.
- Tell any spawned coding agents to operate inside the issue worktree only and not touch the main checkout or other feature worktrees.
- Before opening a PR, run the narrowest relevant checks first, then the repo's required pre-push gates when feasible.
- Open the PR against `master`, the single trunk.
- After PR creation, inspect CI, fix failures in the same worktree/branch, push updates, and repeat until CI is green.
- Merge through the approved GitHub PR path.
- Releases are cut from `master` (semver tag + GitHub release); `staging`/`production` are deploy environments driven by CI/tags, not branches.
