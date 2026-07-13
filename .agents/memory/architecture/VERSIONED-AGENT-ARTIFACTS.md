---
name: Versioned Agent Artifacts
description: Typed canonical references, immutable version pins, Desktop v1 scope, and the legacy-reference removal gate for issue #1673.
type: project
---

# Versioned Agent Artifacts

## Decision

Agent artifacts are references over the existing canonical `Asset`, `Post`,
`ContentDraft`, `Ingredient`, `Article`, and `Newsletter` records. The supported
kind set is finite. Each kind resolves through its existing canonical serializer;
there is no generic artifact registry and no duplicate artifact lifecycle.

An immutable `ContentVersionPin` is created only when a review, approval, or
other consequential policy needs an exact content identity. A pin stores the
canonical kind and record id, organization and optional brand scope,
`sha256:v1:<64 lowercase hex>` material digest, optional record version,
idempotency key, creator, creation time, and provenance. It does not copy
canonical content or carry mutable status, approval, publishing, or deletion
state. Database triggers reject pin updates and deletes.

**Why:** Conversation, review, approval, and publishing must resolve the same
authorized canonical record and exact material state without creating a second
content store.

**How to apply:** Store typed references and pin ids on agent messages and runs.
Resolve the reference and canonical record under the same organization and
optional brand authorization. Reuse pins by organization-scoped idempotency key.
Bind version-sensitive Post review through `Post.reviewVersionPinId`, and
ContentDraft/Newsletter approval through `approvedVersionPinId`. Publishing a
pinned Post or Newsletter re-resolves the same pin and rejects execution when
the canonical material digest changed after approval.

## Desktop v1

Desktop v1 excludes local-only version-bound approval flows. Local/BYOK records
remain local-first and account-optional, but Desktop must not treat mutable local
state, chat text, or an unpinned record as a version-bound approval.

A cloud-connected Desktop client may consume server-created pins and
version-bound approval flows from the connected Genfeed deployment because the
server owns the canonical record, scope authorization, immutable pin, and
execution check. This does not add a Desktop-local pin schema or require cloud
connect for non-version-bound local workflows.

## Legacy Message-Reference Compatibility Removal

Only messages that predate the typed-reference migration are eligible for the
legacy message-derived reference resolver. New messages default to strict typed
references. Every eligible read increments the denominator counter; a read
served by the legacy resolver also increments the legacy numerator and records
its last-use time and source. Structured service telemetry adds the deployment,
client, and cohort dimensions.

Compatibility extraction is limited to 20 allowlisted canonical ids from
structured legacy `uiActions[].contentId` and
`uiActions[].ingredients[].id` fields. It never treats URLs, rendered text, or
action ids as authority. Each legacy message may use compatibility at most 20
times; after that it must be upgraded to a typed canonical reference.

The resolver may be removed only when **each deployment/client cohort** records
legacy compatibility reads at **less than 1.0% of all eligible artifact-reference
reads**, with **at least 10,000 eligible reads**, over a rolling window of **14
complete UTC days**. Cohorts pass independently and cannot borrow traffic. A
cohort below the minimum has not passed. Internal/test traffic and known bots are
excluded explicitly; changing the event definition resets the 14-day window.
The denominator snapshot and telemetry query/version must accompany the removal
decision.

This is the artifact-specific application of the accepted #1671 gate in
`ADR-CONVERSATION-SHELL-CONTRACTS.md`; that accepted ADR remains unchanged.
