---
name: agent_exact_cost_chat_billing
description: Agent chat LLM rounds settle at exact provider cost as fractional credits; one shared credit display formatter; admin unit economics + revenue ledger
type: project
status: active
last_verified: 2026-09-25
topics: [agent, billing, credits, display, unit-economics, stripe]
---

**Rule:** Every agent LLM round is reserve → run → settle
(`runReservedAgentLlmRound`, `agent-orchestrator/utils/agent-llm-round-reservation.util.ts`).
The hold is the round's maximum estimate (`AgentChatModelRegistryService`); the
settlement is the round's actual provider cost converted to **fractional**
credits by `calculateAgentExactCredits` (base margin × runtime operator margin
knob). Cost source, in order: BYOK (`usage.is_byok`) → 0; provider-reported
`usage.cost` (OpenRouter); otherwise the answering model's $/1M list price ×
reported tokens (native Anthropic/OpenAI). A round that outgrows its hold
settles the hold and deducts the remainder as a separate overflow entry with a
matching overdraft allowance. Waived turns (`turnCost === 0`, e.g. the brand
interview) never reserve. Desktop CLI turns (`local/claude-cli`,
`local/codex-cli`) never reserve either.

**Credit display rules** (`packages/contracts/src/constants/credit-display.constant.ts`
is the only formatter; the ledger keeps full precision):
- Balance: whole credits rounded **down**, thousands separators; ≥ 100,000 the
  chip is compact (`124k`, `1.2M`, rounded down) with the exact value in a
  title/tooltip (`formatCreditBalanceExact`).
- Cost (message, tool call, turn, ledger row): at most one decimal, `<0.1`
  below 0.1, `Free` for zero (`formatCreditCost`).
- Model pickers: `≈ X credits / message` from `getMessageCostEstimatesMap`
  (average-message token footprint; display only, never billing).

**Unit economics (platform admin only):** Admin → Administration → Unit
Economics (`/admin/administration/unit-economics`, `GET /v1/admin/unit-economics`,
super-admin + IP allowlist) joins credit usage, `llm_vendor_costs` (now with
`userId`), `media_vendor_costs`, and `billing_revenue_events`. Stripe checkout and
invoice webhooks write `billing_revenue_events` idempotently per Stripe object
(unique `stripeObjectId`, best-effort). Revenue exists only from the deploy that
shipped migration `20260925120000_agent_unit_economics` onward — earlier periods
show zero revenue, not missing data to backfill silently.

**Why:** A flat per-round tier over- or under-charged by model and message size;
exact settlement makes chat usage-based. Fractional ledger values made long
decimals leak into UI, so one formatter owns display.

**How to apply:**
- Never format credits ad hoc (`toFixed`, raw numbers) in UI; use the helpers.
- Never store or log prompt/completion text in settlement metadata (model,
  tokens, provider USD, cost source only).
- Margin multipliers and unit-economics targets are private business
  strategy: keep them out of public user docs. Public docs describe
  "usage-based, fractional credits" only (`apps/docs/content/cloud/billing.mdx`).
- The migration builds its indexes non-concurrently (brief write lock on
  `credit_transactions`, `llm_vendor_costs`, `media_vendor_costs`); the
  self-host upgrade note lives in `apps/docs/content/core/installation.mdx`.
