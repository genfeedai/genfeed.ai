# Agent System -- Architecture Reference

Last verified: 2026-09-28. Code layout lives in `apps/server/api/src/services/agent-*`, `packages/actions/src/registry/` and `packages/agent/src/`; read the source for structure.

## Overview

The agent system is a multi-turn LLM chat orchestrator with tool execution, event sourcing, streaming, memory, and sub-agent delegation. It spans backend services, persistent agent records, a shared tools package, and a React frontend package.

## High-Level Flow

```
POST /agent/threads/:threadId/turns/stream
  |
AgentOrchestratorController
  |
AgentTurnWorkflowExecutionService
  +-- AgentOrchestratorContextService.resolveTurnContext()
  |   +-- Feedback memories (AgentMemoriesService, max 8, ranked by the message)
  |   +-- Brand context (AgentContextAssemblyService.assembleContext), chat layers:
  |   |     brandIdentity, brandGuidance, brandMemory, performancePatterns,
  |   |     recentPosts, ragContext (brand-scoped saved context), brandKnowledge
  |   |     (BRAND_TRUTH Knowledge only). ragContext/brandKnowledge need a query.
  |   +-- Skills, model, system prompt
  +-- AgentModelAccessService.enforceModel() -- free-tier lock
  +-- Credit check: balance must cover one round (brand interview = 0)
  +-- Tool loop (max AGENT_MAX_TOOL_ROUNDS = 25 LLM rounds)
      +-- runReservedAgentLlmRound(): hold estimate -> run -> settle exact cost
      +-- AgentToolExecutorService.executeTool() for tool calls
      +-- Stream events via Redis + thread event log
```

There is no `knowledgeBase` layer. The layer names are the
`AssembledContextLayerName` union in
`agent-context-assembly/interfaces/context-assembly.interface.ts`.

**Model resolution** (first match wins): agent strategy `model` pin ->
organization `agentPolicy.thinkingModelOverride` -> agent type `defaultModel` ->
registry default (`AgentChatModelRegistryService.getDefaultModelKey`, i.e.
`LLM_DEFAULTS.agentChat`). Retired keys map forward to their registry
successor. The free-tier lock then replaces the result with
`LLM_DEFAULTS.agentChat` for unsubscribed hosted orgs
([free-tier lock](../../project_agent_free_tier_model_lock.md)).

**Parity:** the Brand settings -> Agent context page, `GET
/v1/brands/:brandId/agent-context`, and `get_brand_context` all call
`resolveTurnContext` ([snapshot parity](../../project_agent_context_snapshot_parity.md)).

**Billing:** exact provider cost per round as fractional credits
([exact-cost chat billing](../../project_agent_exact_cost_chat_billing.md)).

**External runtimes:** Desktop can run a turn on the user's Claude Code / Codex
CLI; the turn is appended with `POST /agent/threads/:id/external-turns` and never
reserves credits ([CLI runtime](../../project_desktop_cli_agent_runtime.md)).
