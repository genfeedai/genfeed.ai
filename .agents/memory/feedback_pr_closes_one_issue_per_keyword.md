---
name: feedback_pr_closes_one_issue_per_keyword
description: PR bodies use one closing keyword per issue; a comma list only auto-closes the first
type: feedback
status: active
last_verified: 2026-08-17
topics: [github, pull-requests, issue-tracking, workflow]
---

**Rule:** In a PR body, write one closing keyword per issue — `Closes #3018`, `Closes #3019`,
`Closes #3020` — each on its own line. Never `Closes #3018, #3019, #3020`.

**Why:** GitHub links only the first number after a keyword. #3045 shipped five issues with a
comma list; only #3018 auto-closed and #3019/#3020/#3024/#3025 stayed open on the board for a
week after the code was on master (found in the 2026-08-17 board audit).

**How to apply:**
- Every issue a PR ships gets its own `Closes #N` / `Fixes #N` line.
- On merge, glance at the PR's "Development" sidebar: every listed issue should be closed.
  If one is still open, close it by hand with a "shipped in #PR" comment.
- Board audits treat "merged PR references an open issue in its body" as a stale-issue signal.
