---
name: Source post brand-voice variation decisions
description: Architecture and tradeoffs for issue 2662
type: project
---

# Source Post Brand-Voice Variation Decisions

## Chosen approach

Add a synchronous source-variation orchestration path beside post repurposing. It resolves the source first, uses the existing content generator for assembled brand context, filters unusable outputs, creates one manual review batch, and stamps the resulting posts with the existing grouping and lineage fields.

This keeps actual-output reporting and credit finalization in the request that produced the drafts. It also reuses the canonical channel capability catalog and review lifecycle without creating placeholder posts or a parallel draft model.

## Alternatives considered

1. Extend account generation and its asynchronous placeholders. This reuses `groupId`, but source text is currently dropped from that prompt path and an immediate placeholder response cannot accurately report or charge partial usable output. Repairing those boundaries would add more new behavior than a dedicated orchestration seam.
2. Model the operation as a multi-step agent workflow. That is flexible for future automation, but adds workflow latency, another observable state machine, and indirect credit reconciliation to a single explicit user action.
3. The selected synchronous orchestrator reuses content generation, channel constraints, serializers, and manual review batching while keeping authorization and actual-output credit accounting in one auditable transaction boundary.

## Persistence decision

No schema migration is required. Standard post fields already represent the contract:

- `groupId` groups the comparison set.
- `order` stores zero-based position.
- `generationId` identifies the generation run.
- `variantId` stores one-based position and final actual count.
- `originalPostId` links owned-post sources.
- `sourceActionId` and `sourceWorkflowId` identify followed/imported sources and the source-variation workflow.
- `reviewBatchId` and `reviewItemId` preserve the standard review lifecycle.

Trend-reference sources additionally use the existing `TrendRemixLineage` relation. Response metadata supplies requested count, actual count, partial reason, and the explicit voice-mode label without duplicating them in every post row.

## Authorization decision

An endpoint guard resolves and attaches the canonical source before `CreditsGuard`. Owned posts and followed source posts are organization- and brand-scoped. Imported source references must be reachable through the submitted non-deleted trend under the same organization and brand; the global reference ID alone grants no access.

## Originality decision

Prompt instructions are necessary but insufficient. A deterministic output filter normalizes case, whitespace, punctuation, and URLs, rejects normalized verbatim reproduction, rejects duplicate normalized variations, and validates target-platform length. Rejections reduce the actual result count and become a partial-success reason; they never trigger padding.
