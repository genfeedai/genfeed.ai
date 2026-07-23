---
name: MCP Instagram and Meta inspiration remix decisions
description: Architecture and safety decisions for curated brand-aware inspiration MCP actions.
type: project
status: active
last_verified: 2026-07-22
topics: [mcp, instagram, meta-ads, tenancy, workflows]
---

# MCP Instagram and Meta Inspiration Remix Decisions

**Why:** Public creative research crosses provider, tenancy, copyright, and write-approval boundaries that must remain explicit.
**How to apply:** Route through the curated Agent executor, keep Instagram discovery ephemeral, require an explicit or selected brand, and preserve source provenance while generating original prompts.

## Decision: reuse the canonical Agent executor route

The six actions use canonical `@genfeedai/tools` definitions and `AgentToolName` dispatch. MCP already proxies these actions to the API Agent executor and validates dispatch coverage at boot. A dedicated Instagram MCP client would duplicate authorization, approval, and response handling.

## Decision: do not use the global trend corpus as tenant cache

`TrendSourceReference` has no organization or brand foreign key. Brand-aware remix counts do not make the underlying references tenant-owned. Instagram discovery therefore uses live provider reads plus a short-lived organization-and-brand-keyed cache. Provider failure never falls back to unscoped corpus results.

## Decision: require explicit or selected brand for remix writes

Generic workflow helpers may fall back to the first organization brand. Inspiration handlers use a stricter resolver: an explicit organization-owned brand wins, otherwise the current user-selected brand is required. This prevents a multi-brand MCP call from creating a workflow under the wrong brand.

## Decision: v1 is creative reinterpretation

V1 analyzes public post metadata and captions into abstract hook, format, pacing, and style signals. It creates a brand-voiced generation prompt and draft workflow. It does not decode or transform the source video, and it never claims video-to-video style transfer.

## Decision: all remix writes require approval

Creating a draft is still a tenant mutation with external-provider and credit implications. `create_instagram_remix_workflow` and `create_ad_remix_workflow` remain behind the existing MCP approval lifecycle. Approved execution still produces only a draft/review artifact.

## Rejected approaches

- **Dedicated Instagram MCP handler/client:** duplicates the proven Agent executor path and expands drift risk.
- **Persist discovery into trend references:** cannot provide organization isolation without a migration and would misrepresent global data as brand-owned.
- **Global corpus fallback:** risks cross-tenant leakage and stale niche matches.
- **Generalized cross-platform inspiration adapter:** useful later, but too broad for a one-PR vertical slice.
- **True video restyling in v1:** requires a separate media-analysis and video-to-video model contract.
