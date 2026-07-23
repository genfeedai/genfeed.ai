---
name: Superseded pull-request validation waste
description: Exact-SHA cancellation replacement and discarded runner-time evidence contract for issue #1967
type: project
---

# Superseded Pull-request Validation Waste

## Goal

Extend the read-only pull-request validation telemetry report with measured work
from non-final pull-request heads. The report associates every observed workflow
run with its exact commit SHA, classifies cancelled runs only when a later head
fully replaces the same workflow job contract, and estimates runner time spent
on every obsolete run.

**Why:** Epic #1850 needs evidence of superseded validation waste before changing
workflow concurrency or removing validation work.

**How to apply:** Use the existing manually dispatched
`pr-validation-telemetry.yml` workflow. Treat `supersededValidation` as a
separate evidence surface from final-head readiness; incomplete historical data
must not change the final-head `ready`, `failed`, or `incomplete` disposition.

## Evidence contract

- Pull-request commit pagination provides the ordered candidate head SHAs; the
  sequence must end at the pull request's final head SHA. Reaching GitHub's
  250-commit retrieval cap makes the historical total incomplete.
- Workflow runs are collected with GitHub REST `head_sha` filters and retain
  `workflow_id` plus `run_attempt` identity. Explicit pull-request associations
  take precedence; when GitHub omits them for a merged pull request, the exact
  head branch and repository must both match.
- Every rerun attempt and its paginated jobs are fetched separately so a
  cancelled earlier attempt cannot be collapsed into the latest attempt.
- GitHub request fan-out is bounded to avoid secondary rate-limit failures.
- A job with no assigned runner contributes zero. An assigned job with missing
  or reversed timestamps makes that run's discarded-time estimate incomplete.
- Every workflow run on a non-final SHA is obsolete work. Its discarded runner
  time is the sum of assigned-job durations, including parallel jobs.
- A cancelled obsolete run is `cancelled-safe` only when a later head has a
  terminal run for the same workflow ID whose complete terminal job-name
  multiset covers the cancelled run's contract.
- Empty, partial, missing, cancelled, timed-out, stale, startup-failed, or
  otherwise non-terminal replacement evidence is `cancelled-unresolved`.

## Non-goals

- Changing concurrency, cancellation, cache, workflow topology, or branch
  protection.
- Claiming that supersession caused a cancellation.
- Enforcing latency or waste budgets.

## Verification

Fixture coverage proves exact-SHA association, safe and unresolved replacement,
job-contract coverage, runner-only duration sums, partial pagination handling,
summary aggregation, and unchanged read-only workflow concurrency.
