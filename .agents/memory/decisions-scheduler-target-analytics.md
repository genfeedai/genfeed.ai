---
name: Scheduler Target Analytics Decisions
description: Read-model tradeoffs for issue 1975
type: project
status: active
last_verified: 2026-07-22
---

# Scheduler Target Analytics Decisions

## Optimization Target

Minimize query count and client orchestration while preserving the existing
scheduler response and analytics ownership boundaries.

## Considered Approaches

1. Extend each scheduler target with a batched latest-snapshot summary.
   - Lowest client complexity and one bounded query per release/list hydration.
   - Reuses the canonical target `Post` and existing `PostAnalytics` rows.
2. Add a separate release-analytics endpoint.
   - Keeps scheduler payloads smaller, but creates a second authorization and
     client orchestration path for the same release detail.
3. Embed raw analytics history on each target.
   - Maximizes data availability, but overfetches, weakens the read-model
     boundary, and couples scheduler clients to analytics persistence.

## Decision

Use approach 1. Return one typed latest-snapshot summary per target, hydrate all
targets in a batch, and keep collection state/history for later #1134 slices.

## Rejected Assumptions

- Missing analytics does not mean all metrics are zero.
- A matching `postId` alone is not sufficient; organization, brand, and
  platform must also match the target.
- Analytics failure must not change an already successful publish state.
