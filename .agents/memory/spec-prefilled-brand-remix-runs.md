---
name: Prefilled brand-aware remix runs
description: Turn eligible Discover and Ads sources into editable, asset-backed Studio runs with review and downstream lineage
type: project
status: active
last_verified: 2026-08-20
topics: [discover, ads, remix, studio, generation, assets, workflows, publishing, analytics]
---

# Prefilled Brand-Aware Remix Runs Spec

Canonical issue: #3338.

**Why:** Genfeed can discover trends and ads, generate brand-aware text, create media, review assets, publish content, and prepare campaigns, but the operator still has to manually reconstruct source intent and reselect brand assets between those surfaces.

**How to apply:** Compile an authorized trend or ad source into the canonical generation brief, prefill an editable Studio run from active-brand defaults and explicit Library references, preserve provenance through review, and keep publish or campaign activation behind approval.

## Purpose

Create one auditable user path from a promising public or connected-account source to original on-brand creative:

`Discover / Ads -> Remix -> Prefilled brief -> Studio run -> Library / Review -> Publish or paused campaign -> performance lineage`

The operator chooses a source and can generate brand-aware copy, images, short video, or avatar video without copying prompts or reconstructing brand context by hand.

## Optimization Target

Optimize first for a complete, trustworthy handoff: tenant-safe source resolution, deterministic prefills, real provider reference assets, draft-only downstream actions, and traceable lineage. Optimize second for speed by minimizing operator choices to the fields that materially change creative intent.

## Non-Goals

- Copying source captions, scripts, media, people, trademarks, handles, or watermarks.
- Claiming frame/audio analysis or video-to-video transformation when only metadata and caption signals were analyzed.
- Automatically publishing content, enabling a campaign, or spending ad budget.
- Introducing a second generation-brief, asset, workflow, review, or campaign model.
- Replacing platform discovery, Studio, Library, Review, Publish, or Ads Manager.
- Requiring cloud-only features for community or BYOK generation paths.

## Interfaces

### Source selectors

- Eligible organic selectors identify an authorized trend reference, imported source post, followed source post, or owned post by stable ID and source kind.
- Eligible paid selectors identify an authorized public ad snapshot or connected-account ad by stable ID, platform, and account scope.
- Client-supplied prose, metrics, asset URLs, or brand fields are hints only; the server resolves canonical source and brand data before generation or credit preflight.

### Prefilled generation brief

- Source provenance: kind, stable identity, source platform, public URL when safe, captured metrics, capture time, and abstract creative signals.
- Creative intent: hook, angle, structure, pacing, offer, CTA, objective, placement, target platform, and requested output kinds.
- Brand context: active brand, brand voice/harness, approved good/avoid examples, default avatar, default speech voice, and explicit Library reference assets.
- Output specification: aspect ratio, duration where applicable, variation count, fidelity policy, target platform, and review requirement.
- Reference roles use the canonical generation-brief vocabulary such as subject, character, product, style, composition, first frame, and last frame.

### Product surfaces

- Eligible Discover and Ads cards expose one `Remix` action.
- Remix opens an editable generation card or side panel in the current work surface; it does not force the operator through disconnected setup pages.
- Confirming the card creates or reuses a server-authorized draft run and opens `/studio/generate` with only a stable run/brief identity in navigation state.
- Studio displays the source pattern, active brand, selected references, recommended output settings, readiness diagnostics, and the enriched recipe before dispatch.
- Successful outputs enter the existing Library and review lifecycle.
- Approved organic outputs can enter Publish; approved paid outputs can enter the existing paused campaign preparation flow.

## Defaulting Policy

- The server derives platform and source signals from the selected source.
- The active brand supplies voice/harness context and configured defaults.
- Explicit user-selected assets always outrank inferred defaults.
- A configured default avatar plus voice recommends avatar video for vertical video sources; otherwise the system recommends a supported image or video route.
- TikTok, Instagram Reels, and YouTube Shorts default to editable vertical presets; paid placements use the platform capability catalog rather than hard-coded client guesses.
- Variation count defaults to three and remains bounded by the existing credit and provider limits.
- Missing optional context produces visible degraded reasons. Missing required Strict-fidelity references blocks before provider dispatch and consumes no credits.

## Behavior

- Source authorization and brand resolution SHALL complete before credit preflight or external generation.
- The source adapter SHALL abstract reusable creative patterns and SHALL NOT insert source content verbatim into generated output.
- Library asset IDs SHALL resolve to organization- and brand-authorized durable media and then to provider-compatible references; signed URLs SHALL NOT be persisted in the brief snapshot.
- Equivalent authorized source and brand inputs SHALL normalize to equivalent canonical generation briefs across UI, workflow, Agent, API, and MCP entry points.
- A run producing multiple outputs SHALL preserve one run identity, requested/actual output counts, recipe/compiler versions, source provenance, reference roles, and partial/degraded reasons.
- Generative outputs SHALL use the existing artifact/Library and review lifecycle. The feature SHALL NOT create a parallel draft store.
- Publish and campaign preparation SHALL remain explicit downstream actions. Campaigns created from a remix SHALL be paused until approved and activated through the existing Ads Manager boundary.
- Performance attribution SHALL retain the remix source, run, recipe, and output identities so later reporting can compare patterns and variations without treating correlation as causation.

## Edge Cases And Failure Modes

- Deleted, foreign, expired, or unavailable sources fail before credits or provider dispatch.
- A public source that disappears after discovery remains inspectable only through already-authorized captured metadata; unavailable media is never hotlinked into generation.
- Missing brand voice or harness shows an explicit organization-defaults mode rather than claiming full brand fidelity.
- Missing avatar, speech voice, product reference, unsupported reference role, or unsupported aspect/duration yields an actionable blocked or degraded reason.
- Partial provider success persists and charges only usable outputs; the system never pads rejected or missing variations.
- Returning to an in-flight run re-subscribes to job state and does not strand outputs in processing.
- Cross-organization source, brand, credential, asset, workflow, artifact, post, and campaign identities are rejected.
- Self-hosted or BYOK installations without public trend providers can still remix owned/imported sources and use supported local generation routes.

## Acceptance Criteria

- WHEN an operator selects Remix on an eligible TikTok, Instagram, YouTube, Meta, Google/YouTube Ads, or TikTok Ads source, THE SYSTEM SHALL open one editable prefilled generation experience with source provenance, active-brand context, output recommendations, and review policy visible.
- WHEN a remix is opened, THE SYSTEM SHALL derive source signals and brand defaults server-side and SHALL NOT require the operator to copy a prompt between product surfaces.
- WHEN explicit Library assets, avatar, or speech voice are selected, THE SYSTEM SHALL carry their stable identities and semantic roles into the canonical generation brief and provider request where supported.
- IF a selected source or reference is foreign, deleted, unavailable, or unauthorized, THEN THE SYSTEM SHALL reject the request before credit preflight and provider dispatch.
- IF Strict fidelity requires an unavailable or unsupported reference, THEN THE SYSTEM SHALL block with an actionable reason and consume no credits.
- WHILE Guided fidelity omits an unsupported signal, THE SYSTEM SHALL show and persist a degraded reason without claiming Strict fidelity.
- WHEN a run requests multiple variations, THE SYSTEM SHALL group them under one run and expose the enriched recipe, source lineage, requested/actual counts, and per-output status.
- WHEN usable outputs complete, THE SYSTEM SHALL place them in the existing Library and manual review lifecycle.
- WHEN an approved organic output is sent downstream, THE SYSTEM SHALL create or update a publish draft and SHALL NOT publish without explicit approval.
- WHEN an approved paid output is sent downstream, THE SYSTEM SHALL create or update a paused campaign draft and SHALL NOT enable spend without explicit approval.
- WHEN published or campaign performance is later available, THE SYSTEM SHALL retain enough lineage to report performance by source pattern, run, recipe, and output.
- THE SYSTEM SHALL preserve current credit accounting, provider routing, safety, ownership, soft-delete, serializer, workflow, and self-hosted/BYOK boundaries.

## Delivery Slices

1. Canonical remix-source adapters and prefill policy for organic and paid sources.
2. Server-authorized draft/run handoff with canonical generation-brief assembly and reference resolution.
3. Discover and Ads Remix cards plus the prefilled Studio generation experience.
4. Asset-backed image, video, and avatar dispatch with grouped runs, recipes, and resumable job state.
5. Library/review handoff and approved Publish/paused-campaign downstream actions.
6. Provenance and performance-lineage reporting across the completed workflow.

Each slice must land as part of an executable vertical path or remain on the feature branch; disconnected foundations are not considered shipped.

## Test Plan

- Contract tests for deterministic organic/ad source normalization and equivalent cross-surface generation briefs.
- Backend integration tests for tenant/brand/source/reference authorization, credit-before-dispatch ordering, asset URL resolution/redaction, workflow/run persistence, partial success, review handoff, publish draft creation, and paused-campaign creation.
- Frontend component tests for eligible Remix actions, default recommendations, editable fields, readiness diagnostics, blocked/degraded states, grouped results, recipe/source inspection, and navigation recovery.
- E2E tests for one TikTok organic route and one Meta ad route from source selection through generated output, Library review, and downstream draft creation.
- Security tests for cross-organization selectors and stale or signed reference URLs.
- Automated coverage on added or changed code remains at least 80%.
- On the MacBook, run formatting, linting, UI guards, diff checks, and secret scans locally; PR CI owns tests, typechecks, builds, coverage, serializer audits, and the full E2E gate.

## Dependencies

- #1650 model-aware generation briefs and the shipped canonical contract from #2152.
- #3311 Studio runs, enriched recipe inspection, Vary, and in-flight re-subscription.
- #2837 real brand harness good/avoid examples for at least one production brand.
- #2662 source-post brand-voice variations and its authorization, grouping, review, and lineage boundaries.
- #1980 Instagram/Meta inspiration remix actions and draft workflow boundary.

## Risks And Open Questions

- Some public-ad providers expose snapshots without durable tenant-owned identities; adapters must distinguish public source identity from authorization to create a tenant run.
- Platform recommendations and provider capabilities change; preset selection must consume the capability catalog and stay editable.
- Performance signals can be sparse or confounded; the first release records lineage and descriptive results but does not claim automatic causal optimization.
- Exact logos, legal copy, typography, and layout require deterministic composition when exactness is requested; prompt text alone cannot satisfy Strict fidelity.
