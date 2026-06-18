---
name: Ready PRs by default
description: Open normal mergeable PRs to master by default; draft PRs are opt-in or blocked WIP only
type: feedback
status: active
last_verified: 2026-06-18
topics: [workflow, git, github, pull-requests]
---

**Rule:** For Genfeed.ai, open normal ready-for-review pull requests to `master` by default. PR review and CI are the handoff/gate.

**Why:** Vincent corrected the prior behavior where implementation PRs were opened as drafts because a generic local skill defaulted to draft until CI or production evidence was complete. That is not the Genfeed.ai workflow. A missing CI result, pending review, or missing production EXPLAIN evidence belongs in the PR body as risk/follow-up context; it is not by itself a reason to use draft.

**How to apply:**
- Use `gh pr create --base master --head <branch> ...` without `--draft` unless Vincent explicitly asks for a draft.
- Draft PRs are only appropriate for genuinely blocked/WIP work where review should not start yet.
- Quick fixes still get normal ready PRs; CI and review decide whether they merge.
- After opening the PR, inspect CI and push fixes on the same short-lived branch until checks pass.
