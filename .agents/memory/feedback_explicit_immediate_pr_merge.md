---
name: Explicit immediate PR merge is a per-PR admin bypass
description: When Vincent explicitly orders PRs merged without checks, merge each PR directly; never aggregate the queue first
type: feedback
status: active
last_verified: 2026-08-13
topics: [workflow, git, pull-requests, ci, emergency-merge]
---

**Rule:** The normal checked PR workflow remains the default. When Vincent explicitly
orders open or named PRs merged immediately without checks, that current-conversation
instruction is an emergency operator override: merge every requested PR individually
with the available GitHub administrative bypass.

**Why:** Vincent is intentionally accepting a temporarily red trunk so the combined
result can be repaired once before cutting a release. Waiting for each PR, repairing
and re-queuing it, or aggregating the queue into a replacement PR changes the requested
workflow and can add multiple full CI cycles.

**How to apply:**

1. Resolve the exact requested open PR set and immediately run the repository's normal
   merge method with the admin bypass for each PR (for example,
   `gh pr merge <number> --squash --delete-branch --admin`).
2. Do not wait for checks, repair PR branches first, re-queue red PRs, or create an
   aggregate/stabilization PR as a substitute for merging the original PRs.
3. After all requested PRs land, fetch the resulting trunk and diagnose the combined
   state once. Repair it through the repo's master-PR workflow unless Vincent explicitly
   grants a separate override for direct trunk writes.
4. If GitHub rejects the administrative bypass, report the exact server-side blocker
   immediately. Do not silently reshape the operation into a serial or aggregate train.
5. Apply this exception only when Vincent explicitly requests immediate unchecked
   merging in the current conversation. Otherwise, required checks remain hard gates.
