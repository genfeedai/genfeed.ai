---
name: agent_context_snapshot_parity
description: "What the agent knows" (Agent context page, GET /brands/:id/agent-context, get_brand_context) must reuse resolveTurnContext so it equals a real chat turn
type: project
status: active
last_verified: 2026-09-25
topics: [agent, brand-context, knowledge, memory, mcp]
---

**Rule:** The brand context snapshot is built by running the chat turn's own
assembly: `AgentBrandContextSnapshotService` calls
`AgentOrchestratorContextService.resolveTurnContext()` for a threadless turn in
the requested brand, then renders it read-only (system prompt via
`renderSystemPrompt`, memory block via `buildMemoryPromptSections`, budget
report via `AgentContextAssemblyService.renderSystemPrompt`). Three surfaces
share it:

- Brand settings → **Agent context** (`/[orgSlug]/[brandSlug]/settings/agent-context`)
- `GET /v1/brands/:brandId/agent-context?query=` (`AgentBrandContextController`)
- curated action `get_brand_context` (surfaces `agent` + `mcp`, `creditCost: 0`)

Nothing persists: no thread, message, or credit.

Supporting endpoints: `GET /agent/memories/personal`,
`POST /agent/memories/personal/:id/archive`, `GET /agent/memories/brands/:brandId`,
and `GET /brands/:brandId/memory/insights` (serialized with
`BrandMemoryInsightSerializer`, limit clamped 1–100).

Brand context layers (chat): `brandIdentity`, `brandGuidance`, `brandMemory`,
`performancePatterns`, `recentPosts`, `ragContext` (brand-scoped saved context,
`## Retrieved Brand Memory`), `brandKnowledge` (BRAND_TRUTH Knowledge only,
`## Brand Knowledge`). INSPIRATION / RESEARCH Knowledge stays behind
`search_knowledge`. There is no `knowledgeBase` layer.

**Why:** A separate "preview" assembly drifts from the real prompt and shows
users something the agent never sees.

**How to apply:**
- Add a new context layer inside `resolveTurnContext` /
  `assembleContext`, then surface it in
  `agent-orchestrator/utils/agent-brand-context-snapshot.util.ts`; never compute
  a layer only for the snapshot.
- RAG and Knowledge retrieval must stay brand-scoped (`ContextsService`
  `isContextBaseInBrandScope`, `knowledgeBrandId` in the similarity query);
  an empty `brandId` returns nothing rather than widening the query.
- Brand writes that change the prompt (brand update/delete, agent config,
  interview) invalidate `SCOPED_CACHE_TAGS.BRAND_CONTEXT(orgId)`.
