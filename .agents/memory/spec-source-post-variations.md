---
name: Source post brand-voice variations
description: Generate a reviewable group of distinct, source-aware post variations
type: project
---

# Source Post Brand-Voice Variations Spec

## Purpose

Turn one authorized imported, followed, or owned source post into a configurable set of publish-ready variations while preserving source provenance, brand context, platform constraints, review lifecycle, and per-output credit accounting.

## Optimization target

Optimize first for correctness and auditability at the tenant, source, generation, and credit boundaries, then for reuse of current generation and review infrastructure. The request must fail before any external generation or credit reservation when the source is unavailable, and a successful response must describe and charge only the usable outputs that were actually persisted.

## Interfaces

- API: `POST /posts/source-variations`.
- Input: exactly one of `postId`, `sourcePostId`, or `sourceReferenceId`; imported references also carry their owning `trendId`.
- Input: `credentialId`, target `platform`, and `count` from 1 through 10; `count` defaults to 3.
- Output: a serialized post collection plus generation metadata containing requested count, actual count, partial reason, review batch ID, group ID, and voice mode.
- UI: `/publish/remix` is the canonical setup and grouped comparison surface reached from owned posts, followed source posts, and imported trend references.

## Behavior

- The source resolver SHALL prove organization and active-brand access, soft-delete availability, and usable source text before the credit guard or content generator executes.
- The generation prompt SHALL include bounded source content, an originality instruction, N distinct angle/structure requirements, the target platform limit, and the active brand context.
- When an explicit brand voice exists, metadata and UI SHALL label the result `Brand voice`.
- When no explicit brand voice exists, generation SHALL use the assembled organization/brand defaults and metadata and UI SHALL label the result `Organization defaults (no brand voice configured)`.
- Returned outputs SHALL be filtered for platform validity, normalized source reproduction, and normalized duplicates. The system SHALL never pad rejected or missing outputs.
- If at least one output survives, all surviving outputs SHALL enter one manual review batch and one standard post group. `order` is the zero-based group position; `variantId` carries the one-based position and final actual count; existing lineage fields identify the source workflow and source entity.
- Imported reference outputs SHALL also retain canonical trend remix lineage.
- If fewer outputs survive than requested, the response SHALL report the actual count and a human-readable partial reason.
- Credits SHALL preview at one caption-generation credit per requested variation and finalize at one credit per persisted variation.

## Non-goals

- Replacing the content generator, review inbox, post serializer, or channel capability catalog.
- Generating threads or media variations.
- Introducing a second draft lifecycle or a new source model.
- Treating a global trend reference ID by itself as authorization.

## Acceptance criteria

- WHEN a valid source is submitted without a count THE SYSTEM SHALL request three variations.
- WHEN a count from 1 through 10 is submitted THE SYSTEM SHALL pass that count into generation and preview that many credits.
- WHEN a count is outside 1 through 10 THE SYSTEM SHALL reject it before generation.
- WHEN a source is foreign, deleted, missing, or empty THE SYSTEM SHALL reject it before credit preflight and external generation.
- WHEN generation returns copied, duplicate, missing, or platform-invalid outputs THE SYSTEM SHALL persist only distinct valid outputs and report partial success without padding.
- WHEN outputs are persisted THE SYSTEM SHALL expose source provenance, group identity, position/count, voice mode, and review batch identity through existing serialized post fields and response metadata.
- WHEN a user chooses Generate variations on any of the three source surfaces THE SYSTEM SHALL open the same count/setup surface and then show one grouped comparison state with a Review all action.

## Test plan

- Source-access guard coverage for all source kinds, tenant/brand isolation, soft deletes, empty content, default count, and 1-10 bounds.
- Service coverage for count propagation, source and brand prompt context, platform limits, verbatim rejection, duplicate rejection, partial success, no padding, grouped provenance, voice fallback, and imported lineage.
- Credit guard/controller coverage for requested preview and actual-count finalization.
- Component coverage for count selection, credit preview, voice fallback label, partial state, grouped comparison, and navigation from imported, followed, and owned source surfaces.
- Local formatting, linting, UI-control guard, and staged secret scan only on the MacBook; typecheck, tests, and build run in PR CI.
