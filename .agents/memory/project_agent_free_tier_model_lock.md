---
name: agent_free_tier_model_lock
description: Unsubscribed hosted orgs run every agent turn on LLM_DEFAULTS.agentChat (DeepSeek V4 Flash) unless BYOK pays for the route
type: project
status: active
last_verified: 2026-09-25
topics: [agent, billing, models, free-tier, byok]
---

**Rule:** When organization billing is live (`hasOrganizationBilling()`) and the
organization has no paid subscription, `AgentModelAccessService.enforceModel()`
replaces the resolved model of every agent turn — chat, spawned sub-agents,
plan mode, UI actions, recurring drafts — with `LLM_DEFAULTS.agentChat`
(DeepSeek V4 Flash). Strategy pins, the org `thinkingModelOverride`, agent-type
defaults, and request models are all overridden; the policy's
`thinkingModelOverride` is cleared for a locked turn.

Exceptions: servers without organization billing (Community self-host, and so
Desktop pointed at one) never lock; Desktop signed in to Cloud is locked like the
web app for hosted turns (its CLI runtime turns never use a Genfeed model). A
turn whose route the organization's own BYOK key pays for (native Anthropic/OpenAI key, else OpenRouter key) keeps its model.

**Why:** Free credits must not buy frontier-model pricing. The paid decision is
the same one research access uses (`resolveOrganizationPaidGrant` in
`apps/server/api/src/common/subscriptions/paid-subscription-access.util.ts`),
which reads only persisted subscription rows and the org tier. A subscription
read failure fails closed onto the cheap model.

**How to apply:**
- Enforce at turn execution (`agent-turn-workflow-execution.service.ts`), never
  only in pickers. Pickers read `GET /agent/credits` → `modelAccess` and render
  `AgentModelLockNotice` (upgrade link) instead of a model list.
- Do not add a second "is paid" check; extend `resolveOrganizationPaidGrant`.
- The paid-grant result is cached per org for 30 s; tests that flip a
  subscription must account for it.
- Public docs: `apps/docs/content/cloud/billing.mdx` ("Free plan model").
