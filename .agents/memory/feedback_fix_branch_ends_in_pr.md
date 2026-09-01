---
name: Every fix branch ends in a ready PR — never a "pushed, no PR" handoff
description: A pushed branch with no PR is invisible to the board, CI, and release; the lane is done only when a ready PR exists
type: feedback
status: active
last_verified: 2026-09-01
topics: [workflow, git, pull-requests, agents, handoff]
---

**Rule:** A fix or feature lane is complete only when a ready PR to `master`
exists for its branch. "Implemented and pushed on branch X at SHA Y, no PR was
created per the issue handoff" is not a valid terminal state for any agent,
chip, or Codex run. Open the PR yourself with `Closes #N` before reporting done.

**Why it matters:**

On 2026-09-01 three P0/P1 fixes (#4217 Stripe parameter tampering, #4222
scheduled-failure tracker dedupe, #4219 clip-edit preservation) each sat on a
pushed branch with no PR. The board showed them In Progress, the CodeQL
critical alert stayed open, the nightly E2E stayed red, and #4219 had to be
re-implemented on a second branch (#4232) because nobody saw the first one.
A branch without a PR has no CI run, no review, no board linkage, and no
release path — it is lost work that looks finished.

**How to apply:**

- After implementation and focused verification, run `gh pr create` on the
  same branch. Ready by default (`ready_pr_default.md`); draft only on request.
- The PR body carries one `Closes #N` line per issue
  (`feedback_pr_closes_one_issue_per_keyword.md`).
- An issue handoff that says "do not open a PR" still means "push and open the
  PR"; the human merges, the agent never skips the PR.
- Before claiming an issue, search open PRs and remote branches for the
  number (`claim_work_before_starting.md`). If a branch exists with no PR,
  open the PR from that branch instead of starting a new one.
- Board sync treats a pushed branch without a PR as In Progress drift, not as
  Human Review.
