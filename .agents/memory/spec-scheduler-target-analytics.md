---
name: Scheduler Target Analytics Summary
description: Typed latest-snapshot analytics on canonical scheduler channel targets
type: project
status: active
last_verified: 2026-07-22
---

# Scheduler Target Analytics Summary Spec

## Purpose

Expose the latest existing `PostAnalytics` snapshot on each canonical scheduler
channel target so release-detail consumers can read performance without issuing
separate per-target analytics requests.

## Non-Goals

- Scheduling provider collection, retries, or backfills.
- Persisting collector failure or freshness state.
- Building calendar comparison UI or workflow recommendation inputs.
- Returning analytics history or raw provider payloads.

## Interfaces

- `IChannelTarget` gains one required analytics summary.
- The summary state is `ready` when an exact target/platform snapshot exists and
  `unavailable` otherwise.
- A ready summary contains views, likes, comments, shares, saves, engagement
  rate, snapshot date, and last update time.
- An unavailable summary contains no invented zero metrics.

## Key Decisions

- Reuse `PostAnalytics`; the scheduler target is already the canonical `Post`
  identified by `PostAnalytics.postId`.
- Hydrate latest snapshots with one organization-scoped batch query for all
  targets in a release/list response.
- Match by target id, organization, brand, and platform before exposing a row.
- Extend the existing release response instead of adding a second endpoint.

## Edge Cases and Failure Modes

- A target with no snapshot returns `unavailable`.
- A snapshot for a different organization, brand, target, or platform is never
  exposed.
- Multiple daily snapshots resolve deterministically to the latest date and
  update time.
- Mixed releases may contain ready and unavailable targets independently.
- Analytics absence or lookup results never mutate publish execution state.

## Acceptance Criteria

- WHEN a release detail is read THE SYSTEM SHALL expose the latest available
  metrics for each exact channel target and platform.
- WHEN no matching snapshot exists THE SYSTEM SHALL return a typed unavailable
  state without inventing zero metrics.
- THE SYSTEM SHALL resolve summaries in one bounded batch query and SHALL
  preserve organization, brand, target, platform, and soft-delete boundaries.
- THE SYSTEM SHALL serialize views, likes, comments, shares, saves, engagement
  rate, snapshot date, and last update time for ready summaries.

## Test Plan

- Contract fixtures for ready, unavailable, mixed-platform, and cross-scope
  rows.
- Service fixtures asserting one scoped analytics query for a release read.
- Serializer fixtures proving both summary states survive JSON:API shaping.
- PR CI runs focused tests, typecheck, build, and API/serializer gates.
