---
name: Publish List Projection
description: Use the release-and-target read model for every Publish list surface
type: project
status: active
last_verified: 2026-08-09
---

# Publish List Projection Spec

## Purpose

Make the existing tenant-scoped release-and-target projection the sole read
model for Publish lists and Calendar, so lifecycle, publication, platform, and
content-category filters cannot drift from the target state shown elsewhere.

## Non-Goals

- Redesigning Publish navigation.
- Removing `ContentDraft` (#2643).
- Unifying review-decision vocabulary (#2644).
- Pulling the open multi-type federation implementation from #2604 into this
  strictly sequenced lifecycle branch.
- Removing compatibility Post mutation and detail endpoints.

## Interfaces

- `GET /post-groups` accepts either a Calendar date window or stable list
  pagination/filter inputs and always returns serialized `IReleaseGroup`
  resources with channel targets.
- The list contract supports lifecycle, publication facet, platform,
  credential, content category, source, brand, search, and deterministic sort.
- Publish Posts, Scheduled, Published, Failed, legacy Overview redirects, and
  Overview counts resolve through the release-group service.
- Existing target editor deep links remain `/publish/posts/:targetId` and carry
  the filtered list URL as their return destination.

## Key Decisions

- Extend the existing `/post-groups` projection instead of adding a parallel
  publish-list endpoint.
- Paginate releases after derived filtering and use the release id as the final
  sort tie-breaker.
- Project ungrouped legacy target rows as single-target releases so migrating
  the list does not hide existing content.
- Keep the release serializer as the outbound boundary; no controller-level
  response shaping.

## Edge Cases and Failure Modes

- Deleted groups and targets are excluded before projection.
- Orphaned targets that reference a missing/deleted group are excluded rather
  than reclassified as ungrouped content.
- A partially published release belongs to the posted facet; the not-posted
  facet contains only releases with no published target.
- Empty and out-of-range pages return a stable empty page without changing the
  requested page number.
- A date window is either absent or supplied as a complete bounded pair.
- Tenant scope is applied to both release and target reads before grouping.

## Acceptance Criteria

- WHEN a Publish list is requested THE SYSTEM SHALL return serialized canonical
  releases with their canonical target lifecycle and visibility.
- WHEN the same lifecycle, publication, platform, or content-category filter is
  applied from two Publish entry points THE SYSTEM SHALL resolve through the
  same release query contract.
- WHEN a legacy Publish route is opened THE SYSTEM SHALL preserve supported URL
  filters while selecting the canonical publication facet.
- WHEN identical filter and sort inputs are repeated THE SYSTEM SHALL return the
  same page order using a deterministic release-id tie-breaker.
- IF a legacy target has no release group THE SYSTEM SHALL expose it as one
  tenant-scoped single-target release without inventing a second lifecycle.
- IF a group or target is deleted or outside the caller organization THE SYSTEM
  SHALL exclude it through the existing safe boundary.

## Test Plan

- DTO fixtures for optional bounded windows and list filters.
- Projection fixtures for grouped and ungrouped targets, publication facets,
  target filters, deleted/orphaned rows, deterministic pagination, and tenant
  predicates.
- Serializer fixtures for content category on channel targets.
- App/service fixtures for paginated release responses, route filters, counts,
  and return-preserving target links.
- PR CI owns tests, typechecks, builds, OpenAPI drift, and integration gates on
  this MacBook.
