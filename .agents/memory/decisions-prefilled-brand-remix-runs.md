---
name: Prefilled brand-aware remix run decisions
description: Architecture and tradeoffs for the Discover and Ads to Studio remix workflow
type: project
status: active
last_verified: 2026-08-20
topics: [discover, ads, remix, studio, generation, workflows, assets]
---

# Prefilled Brand-Aware Remix Run Decisions

Canonical issue: #3338.

## Decision: compile sources into the canonical generation brief

Organic and paid sources use small source-kind adapters that resolve canonical data, authorize it, and emit normalized creative intent plus provenance. That normalized input is assembled into the existing generation-brief contract. Studio, workflows, Agent, API, and MCP therefore consume the same brief instead of maintaining surface-specific prompt formats.

## Decision: use a durable server-authorized run identity

Navigation carries only a stable draft/run identity or stable typed selector. Full prompts, metrics, brand context, signed media URLs, and authorization claims never live in query strings or client state as source of truth. The server re-resolves scoped identities before dispatch. Existing workflow/generation/artifact persistence is extended where necessary; a standalone `Remix` persistence model is not introduced unless implementation proves no canonical run boundary can represent the lifecycle.

`ContentRun` is the durable aggregate for this first implementation. Its versioned config stores the source snapshot, editable recipe revision, readiness, execution summary, review handoff, and paid-draft projection. Existing `Ingredient`, `ContentRunVariant`, `Batch`, `Post`, workflow, and performance records remain authoritative for generated assets and downstream state.

The public contract uses a closed, versioned source-selector union for the supported sources. A dynamic adapter registry is deferred until additional source kinds demonstrate that the extra extension mechanism is necessary.

## Decision: Remix is an editable action card, not another destination

Eligible Discover and Ads items open a compact Remix card or inspector panel in the current work surface. It exposes the inferred pattern, output kind, platform preset, count, fidelity, and selected brand assets. Confirming it opens or focuses the corresponding Studio run. This preserves context while keeping Studio the canonical media-generation workspace.

Discover mounts one shared Remix inspector provider. Source cards feed typed selectors into that inspector; confirming a prefill persists the editable run and navigates only to `/studio/generate?run=<id>`. The workflow does not add another Remix page and does not serialize the brief into the URL.

Run operations are explicit only at genuine human pauses: prepare or revise the editable run, start generation, submit usable variants for review, and prepare an approved paid variant as a paused campaign draft.

## Decision: explicit references outrank defaults

The active brand supplies harness context, default avatar, default speech voice, and recommended Library references. Explicit user choices override inferred defaults. References retain semantic roles through brief assembly and provider compilation. Durable asset identities are persisted; signed delivery URLs are resolved only at dispatch and redacted from snapshots.

## Decision: reuse Library, Review, Publish, Campaign, and Workflow lifecycles

Generated media enters the existing Library/artifact and manual review lifecycle. Organic approval can create a publish draft. Paid approval can create a paused campaign draft. Automation and downstream handoffs use canonical workflows and preserve workflow/run provenance. No path auto-publishes, enables spend, or creates a second draft/review model.

## Decision: originality is enforced at both prompt and output boundaries

Source adapters describe abstract hook, angle, structure, pacing, offer, CTA, placement, and visual treatment. They do not carry full source captions, scripts, media, people, handles, or watermarks into the generation request. Existing deterministic text-variation originality checks remain authoritative for copy, and media workflows retain source provenance without representing source media as a generative reference unless the operator owns and authorizes it.

## Decision: performance learning starts with lineage

The first complete release records source, run, recipe/compiler versions, outputs, published posts or campaigns, and their later metrics. It supports descriptive comparison and human promotion of winners. Autonomous causal optimization or silent brand-harness mutation is deferred until the lineage and evaluation data are trustworthy.

## Alternatives Considered

1. **Encode prefills in URLs and local component state.** This is the fastest demo but loses authorization, signed-URL safety, refresh recovery, resumability, and cross-surface parity.
2. **Create a standalone Remix entity and orchestration service.** This provides durability but duplicates generation briefs, workflows, run state, review, and provenance.
3. **Selected: source adapters -> canonical generation brief -> workflow-backed Studio run.** This has more integration work up front, but gives one authorization boundary, one recipe contract, real reference assets, resumable execution, and reusable Agent/API/MCP behavior.

## Sequencing Decision

Implement complete user-visible paths in this order:

1. TikTok organic source through image or avatar output, Library, and Review.
2. Meta ad source through creative variants, Library, Review, and paused campaign draft.
3. Instagram, YouTube/Shorts, Google/YouTube Ads, and TikTok Ads using the same adapters and presets.
4. Cross-surface lineage reporting and performance comparison.

The shared contracts may be implemented ahead of a surface only when they are exercised immediately by the same branch's vertical path.
