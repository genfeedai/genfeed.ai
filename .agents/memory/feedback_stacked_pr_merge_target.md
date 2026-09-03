---
name: feedback_stacked_pr_merge_target
description: Stacked PRs are retargeted to master before merge so closing keywords fire and issues link
type: feedback
status: active
last_verified: 2026-09-03
topics: [github, pull-requests, workflow, issue-tracking]
---

**Rule:** A PR closes its issue only when it merges into `master`. When merging a stack, retarget
each PR to `master` before merging it (bottom first), so every `Closes #N` fires, the Development
panel links the PR, and Project #12 moves the card to Done. If a slice is instead collapsed into its
stack parent, close its issues by hand with a comment naming the master commit that carried them.

**Why:** On 2026-09-03 the Publish Campaign stack (#4378 → #4381 → #4382 → #4383) was merged
into its parent branches and squashed to master through #4377 as 073050da0. The code shipped,
but GitHub ignores closing keywords on non-default base branches, so #4142, #4143, #4144, and
#4146 stayed In Progress with no linked PR until the next audit.

**How to apply:**
- Before merging a stack: `gh pr edit <n> --base master` on each PR, bottom to top, merging each
  after the one below lands.
- If a PR was already merged into a feature branch, comment on each issue it claimed to close and
  close it as completed, citing the master commit.
- `feedback_pr_closes_one_issue_per_keyword` still applies: one `Closes #N` line per issue.
