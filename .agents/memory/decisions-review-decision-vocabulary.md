---
name: Review Decision Vocabulary Decisions
description: Compatibility and migration tradeoffs for issue 2644
type: project
status: active
last_verified: 2026-08-09
---

# Review Decision Vocabulary Decisions

## Optimization Target

Eliminate product-facing spelling drift without a risky database-enum rename or
any possibility that malformed historical JSON becomes approval.

## Considered Approaches

1. Keep uppercase Post decisions and lowercase batch decisions with local
   mappers.
   - Preserves the smallest diff but retains two public vocabularies and lets
     serializers, agents, analytics, and filters drift independently.
2. Rename the Postgres enum labels to lowercase in the same deployment.
   - Makes storage visually identical, but couples the product contract to a
     blocking database enum migration and rolling-deploy compatibility risk.
3. Make lowercase values canonical everywhere above persistence and retain one
   explicit uppercase compatibility mapping at the Postgres boundary.
   - Requires exhaustive boundary mapping, but removes product drift while
     preserving the existing database wire contract.

## Decision

Use approach 3. `ReviewDecision` is lowercase and includes explicit `unset`.
`PersistedReviewDecision` is the deliberately retained compatibility alias for
the existing database labels; it must not appear in product-facing contracts.

## Unknown and Legacy Values

- The only recognized spelling aliases are `APPROVED`, `REJECTED`, and
  `REQUEST_CHANGES`, matching the actual persisted Postgres labels.
- Null or missing values map to `unset`.
- Unknown values map to `unset` at runtime, remain untouched during migration,
  and are reported without raw content using a type plus SHA-256 prefix.
- A live migration fails convergence while unknown categories or concurrent
  changes remain, preserving operator control and rerun safety.

## Rejected Assumptions

- A batch lifecycle value such as `pending` is not a review-decision alias.
- `SKIPPED` remains a legacy batch lifecycle compatibility signal for rejected
  items, not a fourth review decision.
- Review state never implies publish lifecycle state, and lifecycle state never
  supplies a missing review decision.
