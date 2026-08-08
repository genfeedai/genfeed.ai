---
name: Publish List Projection Decisions
description: Query and compatibility tradeoffs for issue 2642
type: project
status: active
last_verified: 2026-08-09
---

# Publish List Projection Decisions

## Optimization Target

Eliminate publish-list lifecycle drift while preserving every existing target,
tenant boundary, deep link, and stable filter URL.

## Considered Approaches

1. Add a dedicated `/publish-list` endpoint beside `/post-groups`.
   - Keeps Calendar untouched, but creates the second query owner that #2642 is
     explicitly removing.
2. Keep `/posts` and flatten release status back into the classic Post shape.
   - Reuses most UI code, but retains legacy status projection and makes partial
     releases ambiguous.
3. Extend `/post-groups` with list pagination/filters and migrate Publish list
   consumers to serialized releases.
   - Requires a release-aware list surface, but preserves one derived lifecycle,
     one tenant-scoped query contract, and one serializer boundary.

## Decision

Use approach 3. Calendar remains an unpaginated date-window consumer of the
same endpoint; Publish lists use its paginated mode. Legacy route names express
intent only through canonical filters.

## Publication Facet

- `posted`: at least one target is canonically `published`, including a
  partially published release.
- `not-posted`: no target is canonically `published`.
- Failed is a lifecycle target filter, not a third publication value.

This makes publication a release facet without translating lifecycle back into
the overloaded legacy `Post.status` vocabulary.

## Legacy Ungrouped Targets

An active ungrouped target is represented as a single-target release whose
release id is the target id. A target with a non-null group id whose group is
missing, deleted, or unauthorized is excluded fail-closed. The editor link
continues to address the canonical target id.
