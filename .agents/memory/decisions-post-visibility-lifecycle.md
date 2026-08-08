---
name: Post Visibility Lifecycle Split Decisions
description: Rollout and compatibility tradeoffs for issue 2641
type: project
status: active
last_verified: 2026-08-08
---

# Post Visibility Lifecycle Split Decisions

## Optimization Target

Eliminate lifecycle/visibility dual writes without losing historical audience
intent or pulling forward the classic-list consolidation owned by #2642.

## Considered Approaches

1. Add `visibility` but continue pairing it with legacy `Post.status` writes.
   - Smallest diff, but preserves the exact split-brain architecture #2584 is
     retiring and allows future writers to drift again.
2. Delete `Post.status` and migrate every classic list consumer immediately.
   - Produces a clean schema fastest, but pulls forward #2642 and couples this
     data migration to a separate read-model/route migration.
3. Expand with an optional visibility axis, stop legacy writes, and keep only
   compatibility reads until #2642.
   - Requires explicit fallback mapping and backfill tooling, but preserves old
     clients while establishing one canonical lifecycle writer now.

## Decision

Use approach 3. New writes persist `targetExecutionState` plus explicit
`visibility`; the legacy status column is read-only rollout input. Compatibility
read mapping stays centralized and removable when #2642 retires the classic
projection.

## Migration Classification

- `public`, `private`, and `unlisted` map to the matching visibility.
- Other recognized legacy lifecycle statuses default visibility to `public`.
- A valid, non-drifted `targetExecutionState` wins over legacy status.
- Missing, invalid, or known default-drift lifecycle values map through the
  exhaustive legacy lifecycle mapper.
- Unknown legacy values fail closed into a reported category and never imply a
  published lifecycle.

## Rejected Assumptions

- A `public` legacy value is not itself a lifecycle state; it is evidence of
  both public visibility and historical publication.
- A default `public` value cannot safely be written to every old row at schema
  migration time because it would erase the distinction between unclassified
  and genuinely public data.
- Provider-specific settings JSON is not the canonical audience-visibility
  contract, even when a provider currently stores an equivalent key there.
