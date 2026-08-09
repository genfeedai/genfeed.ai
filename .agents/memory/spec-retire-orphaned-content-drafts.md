---
name: retire orphaned content drafts
description: Canonical Post ownership and preservation-first retirement contract for issue #2643
type: project
---

# Retire orphaned content drafts (#2643)

**Why:** `ContentDraft` duplicated the canonical `Post` review and publishing lifecycle, leaving generated content split across an orphaned API, serializers, queue review service, and producer-specific records.

**How to apply:** Every content producer persists a reviewable `Post`. Review batches link that Post instead of copying it. Historical `content_drafts` rows are preserved and migrated with the dry-run-first, tenant-scoped retirement script before any separately reviewed archive deletion.

## Runtime inventory and target state

- Content Gateway skill runs persist their generated variants as untargeted Posts linked to the originating ContentRun.
- Content Engine skill and media-plan items store `postId` and reuse an already-created pipeline Post.
- Agent Strategy autopilot evaluates and revises the generated Post, then either reuses it for the first publish target or links it into a manual-review batch.
- Manual-review batch creation accepts a tenant-and-brand-owned `postId`; compensation deletes only Posts created by that batch.
- Trend remix lineage references canonical `postId` only at runtime.
- Legacy ContentDraft controllers, services, DTOs, serializers, enums, review queue, Prisma runtime model, and artifact-reference kind are retired.

## Historical migration contract

- Dry-run is the default and reports identifiers plus dispositions, never content.
- Stable-ID pagination and tenant-scoped idempotency keys make live execution resumable.
- Source timestamp/status guards detect concurrent legacy writes.
- Brand, organization, owner, ContentRun, and published-Post ownership must resolve before conversion.
- Deleted or ambiguous rows remain preserved and cause live convergence to fail closed.
- Existing published Posts are linked instead of duplicated.
- The physical historical table is retained as an explicitly retired archive during this change; dropping it requires a separate reviewed migration after a zero-blocker report.

## Acceptance boundary

- The product has one runtime generated-content lifecycle: Post.
- No active controller, provider, queue, serializer, schema contract, or generated client surface exposes ContentDraft.
- Historical migration preserves provenance, media, canonical review pins/state, timestamps, tenant ownership, ContentRun linkage, trend lineage, and content-plan linkage where safe.
- Issue #2644 is out of scope.
