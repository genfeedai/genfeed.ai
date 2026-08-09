---
name: Pipeline navigation as Posts filters
description: Publish Pipeline navigation deep-links into one URL-filtered Posts library
type: project
---

# Pipeline Posts Filters Spec

## Purpose

Publish Pipeline navigation is a set of shareable filters on the canonical `/publish/posts` library, not separately maintained Drafts and Published lists.

## Non-Goals

- Remove the Pipeline navigation group.
- Replace the dedicated exact pending and processing routes owned by #2599.
- Duplicate the multi-type federation owned by #2604 / PR #2624.

## Interfaces

- Review: `status=draft`.
- Drafts: `publicationState=not-posted`.
- Published: `publicationState=posted`.
- Menu query identity: `MenuItemConfig.matchSearchParams`; `null` means the key must be absent.

## Acceptance Criteria

- WHEN a Pipeline item is selected THE SYSTEM SHALL navigate to `/publish/posts` with its canonical lifecycle filter.
- WHEN a Pipeline filter is present THE SYSTEM SHALL activate only its matching Pipeline navigation item.
- WHEN unrelated Posts filters are present THE SYSTEM SHALL keep the generic Posts item active.
- WHEN an exact status is present THE SYSTEM SHALL let it take precedence over a publication facet.
- THE SYSTEM SHALL preserve #2599 as the owner of exact failed, pending, and processing discoverability.

## Test Plan

- Route-builder coverage for status and publication facets.
- Shared menu and sidebar-navigation coverage for query-specific active state.
- Posts query parsing coverage for canonical and invalid values.
- Repository format, lint, UI, route, and secret checks locally; tests, typechecks, and builds in PR CI on the MacBook.
