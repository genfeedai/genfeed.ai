---
name: Pipeline Posts filter decisions
description: Query vocabulary and dependency coordination for issue 2612
type: project
---

# Pipeline Posts Filter Decisions

## Chosen approach

Pipeline items use canonical query facets on `/publish/posts`, and the shared menu contract declares which query parameters determine active navigation. This keeps one Posts list implementation while preserving unrelated URL filters such as platform, type, search, pagination, and task context.

## Alternatives considered

1. Retaining `/publish/scheduled` and `/publish/published` wrappers keeps old URLs but preserves redundant route contracts and query drift risk.
2. Matching the complete query string is simpler but breaks active state whenever unrelated filters are combined or reordered.
3. Duplicating PR #2624's federated library here would violate ownership and create a high-conflict replacement for the older PR.

## Lifecycle vocabulary

- Review uses exact canonical `PostStatus.DRAFT`.
- Drafts uses `publicationState=not-posted`, the existing API complement of public/private/unlisted and therefore inclusive of scheduled and in-progress work.
- Published uses `publicationState=posted`, grouping all live visibility states without conflating social `public` with long-form `published` strings.
- An exact status wins over `publicationState`, matching the Posts API contract.

## Coordination

Issue #2599 and PR #2622 own dedicated failed, pending, and processing discoverability. This issue does not add lifecycle enum values or replace those exact routes; pending and processing remain visible in the broader not-posted Pipeline facet.

Issue #2604 and PR #2624 own multi-type federation. When #2624 rebases after this query contract, its client-side library must consume `publicationState` with the same live/not-live classification; this issue intentionally does not copy its federation, toolbar, or row-routing implementation.
