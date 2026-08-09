---
name: Multi-type Posts library
description: Federate social posts, articles, and newsletters in the Publish content library
type: project
---

# Multi-type Posts Library Spec

## Purpose

The canonical `/publish/posts` desk lists social posts, articles, and newsletters in one operator-facing table without changing their canonical persistence or serializer owners.

## Non-Goals

- Unify the three database models or add a polymorphic persistence layer.
- Move article or newsletter editors under `/publish/posts/:id`; issue #2605 owns type-aware editor unification.
- Redesign the calendar or newsletter integrations.

## Interfaces

- Route: `APP_ROUTES.PUBLISH.POSTS`.
- URL filters: `type`, `platform`, `status`, `search`, and `page`.
- Data owners: existing posts, articles, and newsletters collection services and serializers.
- Editor links: `createArtifactEditorRoute()` plus `withArtifactEditorReturn()`.

## Acceptance Criteria

- WHEN the library loads THE SYSTEM SHALL federate the current brand's social posts, articles, and newsletters.
- WHEN type, channel, lifecycle status, and search filters are combined THE SYSTEM SHALL display only matching rows and reset pagination.
- WHEN a row opens THE SYSTEM SHALL route to that artifact type's canonical editor and preserve the library return URL.
- WHEN no content matches active filters THE SYSTEM SHALL render a filtered empty state distinct from the no-content state.
- THE SYSTEM SHALL use existing serialized services and route helpers rather than inline response shaping or hard-coded editor paths.

## Test Plan

- Pure normalization and combined-filter tests.
- Component coverage for all three editor routes, toolbar registration, and a no-match filter combination.
- Repo linters and formatters locally; typecheck, tests, and build in PR CI on the MacBook.
