---
name: MCP Instagram and Meta inspiration remix
description: Curated MCP actions for brand-aware Instagram inspiration and public Meta Ads remix workflows.
type: project
status: active
last_verified: 2026-07-22
topics: [mcp, instagram, meta-ads, trends, workflows, brands]
---

# MCP Instagram and Meta Inspiration Remix Spec

**Why:** A selected brand needs a traceable path from public niche inspiration to an original, reviewable creative workflow without copying source media or leaking global reference data.
**How to apply:** Keep Instagram discovery ephemeral and organization-keyed, resolve the selected brand server-side, reuse the existing ads research service, and keep every remix workflow draft-only behind MCP approval.

## Purpose

Expose a coherent curated MCP flow that discovers public Instagram inspiration for the selected brand, inspects a source account or post, and creates a brand-safe remix workflow. Expose the existing public Meta Ads discovery, detail, and remix workflow actions through the same curated MCP surface.

## Non-Goals

- True video-to-video style transfer or decoded frame/audio analysis.
- Copying captions, scripts, source media, names, handles, or watermarks into generated output.
- Persisting Instagram discovery results into the global trend reference corpus.
- Automatically publishing social content or launching ads.
- Adding a first-class brand industry field or any database migration.
- Expanding discovery to TikTok, YouTube, or additional ad networks.

## Interfaces

- `list_instagram_inspiration` derives niche seeds from explicit input or the selected brand and returns ranked public Instagram accounts and sampled posts.
- `get_instagram_inspiration_detail` fetches latest or top public posts for one Instagram username and returns normalized provenance plus abstract creative signals.
- `create_instagram_remix_workflow` creates a draft, review-only workflow from a selected public Instagram post.
- `list_ads_research`, `get_ad_research_detail`, and `create_ad_remix_workflow` become canonical Agent and MCP actions while continuing to use `AdsResearchService`.

## Key Decisions

- Canonical action definitions live in `@genfeedai/tools`; MCP dispatches all six actions through the existing Agent executor route.
- Instagram reads are ephemeral. Short-lived cache entries are namespaced by organization, brand, seeds, and query shape; the global trend corpus is never a tenant fallback.
- Explicit `brandId` must resolve inside the caller organization. Otherwise the current user-selected brand is required. Remix writes never fall back to the first organization brand.
- V1 creative analysis uses caption and metadata heuristics to describe hook, format, pacing, and visual style. It produces an original prompt, not transformed source video.
- Instagram media classification uses the presence of `videoUrl`.
- Remix actions are MCP approval-gated and create only draft workflows.
- Source provenance is retained for audit. User-facing caption text is truncated; generation prompts abstract patterns and do not reproduce captions verbatim.

## Edge Cases and Failure Modes

- Missing niche signals return an actionable validation error instead of performing a global search.
- Missing or inaccessible selected brands return an error and do not fall back to another brand.
- Partial hashtag-provider failures return successful candidates from remaining seeds and identify degraded discovery.
- Complete provider failure returns an empty degraded result or an organization-keyed cache hit; it never reads global corpus rows.
- Accounts without usernames and posts without stable IDs are excluded.
- Latest sorting tolerates invalid timestamps; top sorting tolerates missing engagement metrics.
- A source post that is no longer available cannot create a workflow.
- MCP approval resolution executes the original arguments only after approval.

## Acceptance Criteria

- WHEN an MCP client lists tools, THE SYSTEM SHALL expose all six curated inspiration and ads-research actions with hand-authored schemas.
- WHEN Instagram discovery omits `brandId`, THE SYSTEM SHALL use the current user-selected brand within the authenticated organization.
- IF neither an explicit nor selected brand is available, THE SYSTEM SHALL return an actionable error without using the first organization brand.
- WHEN explicit hashtags are absent, THE SYSTEM SHALL derive normalized discovery seeds from brand strategy topics, voice hashtags, or messaging pillars.
- WHEN Instagram candidates are returned, THE SYSTEM SHALL rank them deterministically using seed coverage, normalized engagement, and recency.
- WHEN `sort` is `latest`, THE SYSTEM SHALL order posts by valid timestamp descending; WHEN `sort` is `top`, THE SYSTEM SHALL order posts by engagement descending.
- IF Instagram live discovery fails, THE SYSTEM SHALL use only an organization-and-brand-keyed cache entry or return a degraded empty result.
- THE SYSTEM SHALL NOT expose global trend-corpus rows as tenant-specific Instagram inspiration.
- WHEN an Instagram detail is returned, THE SYSTEM SHALL include source provenance and abstract hook, format, pacing, and style signals without returning the full caption as generated content.
- WHEN either remix action is called through MCP, THE SYSTEM SHALL require approval before creating a draft workflow.
- WHEN an approved remix executes, THE SYSTEM SHALL create a draft/review workflow and SHALL NOT publish content or launch an ad.
- WHEN public Meta Ads actions execute, THE SYSTEM SHALL reuse `AdsResearchService` rather than duplicate public-ad discovery or ranking.

## Test Plan

- Canonical catalog and schema tests for all six actions.
- MCP dispatch and approval-list coverage for read and write actions.
- Brand resolution tests for explicit, selected, foreign, and missing brands.
- Seed derivation, deterministic ranking, video classification, latest/top sorting, and caption-abstraction unit tests.
- Provider partial-failure, complete-failure, cache-hit, cache-isolation, and no-global-corpus fallback tests.
- Executor tests for normalized outputs and workflow draft/review status.
- Existing ads research service and executor tests remain the behavioral regression boundary.
