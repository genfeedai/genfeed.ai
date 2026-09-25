# Agent System -- Architecture Reference

Last verified: 2026-09-25 (context assembly, model resolution, billing, external runtimes); other sections 2026-04-07

## Overview

The agent system is a multi-turn LLM chat orchestrator with tool execution, event sourcing, streaming, memory, and sub-agent delegation. It spans backend services, persistent agent records, a shared tools package, and a React frontend package.

## Documentation Index

| File | Scope |
|------|-------|
| [ORCHESTRATOR.md](./ORCHESTRATOR.md) | Chat loop, tool dispatch, streaming, system prompt resolution |
| [THREADING.md](./THREADING.md) | Event sourcing, snapshots, sessions, execution lanes |
| [COLLECTIONS.md](./COLLECTIONS.md) | Agent persistence records: threads, messages, runs, memories |
| [TOOLS.md](./TOOLS.md) | Tool registry, executor, agent type configs, credits |
| [FRONTEND.md](./FRONTEND.md) | React package: store, hooks, components, WebSocket events |

## Key File Locations

### Backend
- `apps/server/api/src/services/agent-orchestrator/` -- orchestrator, controller, stream publisher
- `apps/server/api/src/services/agent-orchestrator/tools/` -- tool registry + executor
- `apps/server/api/src/services/agent-orchestrator/constants/` -- type configs, credit costs, onboarding prompt
- `apps/server/api/src/services/agent-threading/` -- event engine, projector, session binding, execution lanes
- `apps/server/api/src/services/agent-context-assembly/` -- brand context assembly
- `apps/server/api/src/services/agent-spawn/` -- sub-agent delegation
- `apps/server/api/src/collections/agent-threads/` -- AgentRoom (thread metadata)
- `apps/server/api/src/collections/agent-messages/` -- messages + tool call sub-docs
- `apps/server/api/src/collections/agent-runs/` -- execution tracking
- `apps/server/api/src/collections/agent-memories/` -- persistent memory

### Shared
- `packages/actions/src/registry/` -- canonical tool definitions (`source.agent.ts`, `source.mcp.ts`, `tool-registry.ts`)
- `@genfeedai/actions` -- CuratedActionName, AgentToolOutput; `@genfeedai/contracts/interfaces` -- AgentToolResult
- `packages/contracts/src/enums/agent-*.enum.ts` -- AgentType, AgentThreadStatus, AgentMessageRole, etc.

### Frontend
- `packages/agent/src/` -- full React package (components, hooks, stores, services)

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
