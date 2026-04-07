# Agent System -- Architecture Reference

Last verified: 2026-04-07

## Overview

The agent system is a multi-turn LLM chat orchestrator with tool execution, event sourcing, streaming, memory, and sub-agent delegation. It spans backend services, MongoDB collections, a shared tools package, and a React frontend package.

## Documentation Index

| File | Scope |
|------|-------|
| [ORCHESTRATOR.md](./ORCHESTRATOR.md) | Chat loop, tool dispatch, streaming, system prompt resolution |
| [THREADING.md](./THREADING.md) | Event sourcing, snapshots, sessions, execution lanes |
| [COLLECTIONS.md](./COLLECTIONS.md) | MongoDB schemas: threads, messages, runs, memories |
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
- `packages/tools/src/registry/` -- canonical tool definitions (`source.agent.ts`, `source.mcp.ts`, `tool-registry.ts`)
- `packages/interfaces/src/ai/agent-tool.interface.ts` -- AgentToolName, AgentToolDefinition, AgentToolResult
- `packages/enums/src/agent-*.enum.ts` -- AgentType, AgentThreadStatus, AgentMessageRole, etc.

### Frontend
- `packages/agent/src/` -- full React package (components, hooks, stores, services)

## High-Level Flow

```
POST /agent/chat/stream
  |
AgentOrchestratorController
  |
AgentOrchestratorService
  +-- resolveSystemPromptAndModel()
  |   +-- Agent memories resolved separately (AgentMemoriesService)
  |   +-- Brand context assembled (AgentContextAssemblyService)
  |       +-- Default layers: brandIdentity + brandMemory + knowledgeBase
  |           (recentPosts and performancePatterns are OFF by default)
  +-- Resolve/create thread
  +-- Validate credits
  +-- executeSynchronousChatLoop() [exclusive lane]
      +-- Call LLM (full response, not incremental streaming)
      +-- If tool_calls in response:
      |   +-- AgentToolExecutorService.executeTool()
      |   +-- Deduct credits on success
      |   +-- Push result as role='tool' message
      |   +-- Loop (max 5 rounds)
      +-- Finalize:
          +-- Split final content into words -> publish as tokens (simulated streaming)
          +-- Save assistant message
          +-- Emit 'agent:done' via Redis
```

**Important:** Token streaming is simulated. The LLM returns a complete response, then the service splits the content into words and publishes each via Redis as `agent:token` events. This is NOT incremental model streaming.

**Model resolution:** `request.model` -> `subscriptionDefaultModel` (local/qwen-32b for PAID tiers) -> `brandContext.defaultModel` -> `agentTypeConfig.defaultModel` -> `DEFAULT_MODEL` (deepseek/deepseek-chat)
