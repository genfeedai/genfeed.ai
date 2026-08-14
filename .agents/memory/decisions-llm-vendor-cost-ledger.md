---
name: llm vendor cost ledger decisions
description: Tradeoffs for #2361 telemetry sink and ledger shape
type: project
---

# LLM Vendor Cost Ledger Decisions

## Approaches considered

1. **PostHog-only `$ai_generation`** — fast observability, no durable org/model query, lost if PostHog is unset (self-hosted).
2. **Prisma ledger only** — queryable cost vs credits, no product analytics / LLM session views.
3. **Dual-write (chosen)** — Prisma is source of truth for cost; PostHog `$ai_generation` when `POSTHOG_PROJECT_API_KEY` is set. Matches MCP PostHog + API feature-flag fetch patterns without adding `posthog-node` to the API package.

## Why dual-write

Issue #2361 asks for both a telemetry event and a vendor-cost ledger. PostHog is wired server-side for MCP instrumentation and feature flags, not for API event capture — so capture uses `safeFetch` to the ingestion host (same key/host as MCP), fire-and-forget. Ledger writes are awaited so a crash after the LLM response still usually persists cost.

## Rejected

- Full 13-layer entity scaffold: issue allows an internal query method; no public CRUD.
- `mongoId` on the new model: explicitly forbidden; mongo identity columns were removed in `20260805043000`.
- Spreading provider responses into PostHog: would leak content. Payload is an allowlist.
- Looking up `Model.inputCostPerMillionTokens` on every call: extra DB round-trip. Vendor USD comes from `AGENT_CHAT_MODELS` list prices (already the OpenRouter catalogue). Unknown models record tokens with cost 0.

## BYOK

Customer key → our COGS is 0. Still record tokens/latency for usage analytics.
---
