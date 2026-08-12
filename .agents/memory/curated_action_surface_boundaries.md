---
name: Curated action surface boundaries
description: Reviewed agent-only and MCP-only boundaries in the curated action catalog, and why each one holds
type: decision
---

**last_verified: 2026-08-12**

Companion to [curated_agent_mcp_actions](curated_agent_mcp_actions.md): that rule says surface
transitions must be intentional, this file records the intent behind the asymmetries that remain
after the 2026-08-06 review. Pinned by `curated-action-catalog.spec.ts`.

## Both surfaces

`analyze_performance`, `generate_voice`, `get_analytics`, `get_content_calendar`, `reframe_image`,
`upscale_image`, `search_x_posts`, `fetch_x_post`, and `list_x_account_activity` are headless-safe:
each returns data or an asset URL from a concrete `AgentToolExecutorService` case, so an MCP client
reaches them through the existing `/agent-tools/:name/execute` proxy with no new handler. They match
peers already on both surfaces (`generate_image` / `generate_music` / `generate_video`), and none of
them publishes, so they carry no approval gate. `draft_x_quote` and `draft_x_repost` stay agent-only
because they create in-product review drafts rather than a headless publish.

## Agent only, by design

- **`prepare_voice_clone`** — the `prepare_*` family produces in-app action cards whose value is
  inline selection and upload. There is no headless semantic to expose; `generate_voice` is the
  callable half.
- **`create_brand`** — brand creation is a guided in-product onboarding flow
  (`brand_create_card`, `check_onboarding_status`, `complete_onboarding`). MCP reaches brands
  through `get_brand`, `list_brands`, `get_brand_completeness`, and the approval-gated interview
  tools.
- **`get_campaign_analytics`** — the whole campaign family is agent-only, so MCP has no campaign
  discovery and the tool would be uncallable without an id.
- **`schedule_post`** — the same canonical `/post-groups` backend as the scheduler tools, reached
  through a post id the agent already holds. MCP's native entry is
  `update_scheduled_release` with `scope: 'target'`, which carries the full target contract.

## MCP only, by design

The 14 Meta and Google ads reporting tools (`list_meta_*`, `get_meta_*`, `compare_meta_*`,
`list_google_ads_*`, `get_google_ads_*`) stay on MCP. The in-app agent's ads story is research and
remix — `list_ads_research`, `get_ad_research_detail`, and `create_ad_remix_workflow` are already
on both surfaces. Adding 14 per-account reporting tools to the agent would enlarge its selection
space for a job it does not do.

## Credit visibility

`toMcpTools` advertises each tool's minimum credit charge at
`_meta['genfeed.ai/creditCost']` (`MCP_CREDIT_COST_META_KEY`). `_meta` is the only place vendor
data survives a `tools/list` round trip: the MCP SDK parses `annotations` with a stripping schema,
so an unknown key placed there is dropped by spec-compliant clients.
