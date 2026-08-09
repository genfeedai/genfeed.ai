---
name: Post Visibility Lifecycle Split
description: Separate channel-target audience visibility from publish execution lifecycle
type: project
status: active
last_verified: 2026-08-08
---

# Post Visibility Lifecycle Split Spec

## Purpose

Make `targetExecutionState` the only written lifecycle axis on a channel-target
`Post`, while audience visibility is persisted and validated independently as
`public`, `private`, or `unlisted`.

## Non-Goals

- Retiring the classic Post list or legacy `status` read projection (#2642).
- Removing `ContentDraft` (#2643).
- Unifying review decision vocabulary (#2644).
- Expanding any provider's supported visibility options.

## Interfaces

- `PostVisibility` is the shared lowercase visibility vocabulary.
- `Post.visibility` is an expand-phase optional String column. New writes
  persist an explicit safe default; compatibility reads derive a missing value
  from a recognized legacy visibility-like `status`.
- `Post.targetExecutionState` remains the canonical lifecycle field.
- Post DTOs, serializers, client contracts, MCP actions, and agent actions expose
  lifecycle and visibility as separate fields.
- Platform capability validation rejects unsupported visibility before provider
  execution.

## Key Decisions

- Keep the legacy `status` column readable during rollout, but stop lifecycle
  transition and create/update paths from writing it.
- Use an optional expand-phase visibility column so old rows can be classified
  by a dry-run-first, resumable backfill without temporarily misreporting
  private or unlisted content as public.
- Preserve already-valid canonical lifecycle values during backfill; use legacy
  status only to repair absent/invalid/default-drift lifecycle data.

## Edge Cases and Failure Modes

- Legacy `private` and `unlisted` rows retain their audience setting and map to
  published lifecycle when their canonical lifecycle is missing or drifted.
- Unknown legacy statuses never imply publication or private visibility.
- Rerunning the live backfill performs no additional updates after convergence.
- Concurrent row changes are detected with source-value guards and reported.
- Unsupported platform/visibility combinations fail before any provider call.

## Acceptance Criteria

- WHEN a legacy visibility-like status is read or migrated THE SYSTEM SHALL
  preserve its audience visibility independently from lifecycle.
- WHEN a target is created or updated THE SYSTEM SHALL validate visibility and
  lifecycle independently and SHALL write only their canonical fields.
- WHEN a target lifecycle transitions THE SYSTEM SHALL NOT write the legacy
  `status` column.
- THE SYSTEM SHALL expose lifecycle and visibility through serializers and
  trusted agent/MCP action contracts.
- IF a platform does not support requested visibility THE SYSTEM SHALL reject
  the request before provider execution.
- THE SYSTEM SHALL provide an idempotent, resumable, dry-run-by-default legacy
  backfill with deterministic classifications.

## Test Plan

- Contract fixtures for visibility parsing, legacy fallback, and lifecycle
  mapping.
- Migration fixtures for dry-run, live application, idempotency, pagination,
  invalid data, and concurrent changes.
- DTO/serializer/MCP/agent fixtures for independent axes.
- Provider capability fixtures for supported and rejected visibility values.
- PR CI owns tests, typechecks, builds, generated OpenAPI drift, and integration
  gates under the MacBook policy.
