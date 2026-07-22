---
name: Superseded validation waste decisions
description: Runner-time and replacement-proof decisions for superseded pull-request validation
type: project
---

# Superseded Validation Waste Decisions

## Decision: sum runner occupancy, not workflow wall time

Estimate discarded time by summing `started_at` to `completed_at` only for jobs
with an assigned runner.

**Why:** Parallel jobs consume concurrent runner time, while queued and unassigned
cancelled placeholders consume none. Workflow wall time would undercount the
former and overstate the latter.

**How to apply:** Preserve a `null` run or aggregate estimate when assigned-job
timing or pagination is incomplete; never present a partial sum as a total.

## Decision: keep attempt and pull-request identity explicit

Treat `(workflow run ID, run attempt)` as the job-evidence key and scope
same-SHA runs to the observed pull request before replacement analysis.

**Why:** GitHub reruns reuse a run ID, and the same commit can appear in more
than one pull request. Collapsing either dimension misclassifies cancellations
and runner time.

**How to apply:** Fetch prior attempts from the attempt endpoints. Prefer the
run's `pull_requests` association; only when GitHub returns that array empty may
the exact pull-request head branch and repository serve as the association.

## Decision: prove replacement on a later head

Match replacement runs by stable GitHub workflow ID, require a later commit
ordinal, and compare the complete job-name multiset.

**Why:** A later run with the same display name or a success on the same obsolete
SHA does not prove that the merged head received the cancelled validation
contract.

**How to apply:** Accept normal success, neutral, skipped, or failure conclusions
as terminal evidence. Reject incomplete, cancelled, timed-out, stale,
startup-failed, action-required, missing-job, and contract-subset candidates.

## Decision: keep historical completeness separate from final-head readiness

Store historical collection and replacement faults under
`supersededValidation.incompleteReasons`.

**Why:** Issue #1967 measures historical waste. Missing historical evidence must
remain visible without rewriting the established #1966 final-head disposition.

**How to apply:** Aggregate superseded counts and time separately and leave the
existing final-head timing and disposition algorithm unchanged.
