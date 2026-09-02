---
name: Review Decision Vocabulary
description: One lowercase review-decision contract across Post persistence, batch JSON, APIs, agents, analytics, and UI
type: project
status: active
last_verified: 2026-08-09
---

# Review Decision Vocabulary Spec

## Purpose

Use one lowercase product vocabulary—`unset`, `approved`, `rejected`, and
`request_changes`—for review decisions at every product boundary while keeping
review independent from publish lifecycle.

## Non-Goals

- Changing publish lifecycle or visibility.
- Redesigning review policy or approval UX.
- Renaming the existing Postgres enum labels during this rollout.

## Interfaces

- `ReviewDecision` in `@genfeedai/contracts` is the canonical lowercase contract.
- `PersistedReviewDecision` contains only the three uppercase Postgres labels
  retained for database wire compatibility.
- `parseReviewDecision` recognizes canonical values, nullable unset values, and
  the three historical uppercase aliases. Unknown input returns `unset` with an
  explicit unknown classification.
- Post serializers project nullable/uppercase database values into the
  canonical product vocabulary.
- Batch items, review events, API/client interfaces, agent output, analytics,
  filters, and UI consume the canonical contract.

## Migration Contract

- New batch JSON writes persist an explicit `unset` before review.
- The operator normalizer is dry-run by default, stable-ID paginated,
  idempotent, tenant-scoped, soft-delete-aware, and guarded against concurrent
  source changes.
- Known uppercase JSON aliases normalize to lowercase and missing item decisions
  become explicit `unset`.
- Unknown JSON values remain untouched for deliberate operator resolution and
  are reported only as a type plus non-reversible short hash.

## Acceptance Criteria

- WHEN any known decision crosses a serializer, batch, agent, analytics,
  filter, or UI boundary THE SYSTEM SHALL expose the same lowercase value.
- WHEN a nullable Post value or missing legacy batch value is read THE SYSTEM
  SHALL expose `unset`.
- WHEN a historical uppercase alias is read or migrated THE SYSTEM SHALL map it
  deterministically without changing review semantics.
- IF an unknown decision is encountered THE SYSTEM SHALL never treat it as
  approval and SHALL report a safe migration category.
- Review decisions SHALL remain independent from lifecycle state.

## Test Plan

- Exhaustive canonical, alias, unset, terminal, and unknown mapping fixtures.
- Post serializer fixtures for database labels, null/missing, and unknown input.
- Batch read/write, review-summary analytics, filter, agent, and UI regressions.
- JSON migration fixtures for aliases, explicit unset, idempotency, safe unknown
  reporting, and dry-run argument parsing.
- PR CI owns tests, typechecks, builds, generated drift checks, and integration
  gates under the MacBook policy.
