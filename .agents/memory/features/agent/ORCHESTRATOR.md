# Agent Orchestrator

**File:** `apps/server/api/src/services/agent-orchestrator/agent-orchestrator.service.ts`

## Controller Endpoints

**File:** `apps/server/api/src/services/agent-orchestrator/agent-orchestrator.controller.ts`

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/agent/threads/turns` | Synchronous agent turn for a new or body-scoped thread |
| `POST` | `/agent/threads/:threadId/turns` | Synchronous agent turn for an existing thread |
| `POST` | `/agent/threads/turns/stream` | Streaming agent turn for a new or body-scoped thread (returns `{ threadId, runId, startedAt }`, events via Redis) |
| `POST` | `/agent/threads/:threadId/turns/stream` | Streaming agent turn for an existing thread (returns `{ threadId, runId, startedAt }`, events via Redis) |
| `GET` | `/agent/credits` | Balance, `modelAccess` (free-tier lock), per-model `modelCosts` (≈ credits / message) |
| `GET` | `/brands/:brandId/agent-context` | Read-only brand context snapshot (`AgentBrandContextController`, optional `query`) |

**Request DTO (`AgentChatBody`):**
```typescript
{
  content: string
  threadId?: string
  model?: string
  source?: 'agent' | 'proactive' | 'onboarding'
}
```

## System Prompt Resolution

> **Last verified:** 2026-09-25 against `agent-orchestrator-context.service.ts`.

**Method:** `AgentOrchestratorContextService.resolveTurnContext()` — the single
assembly path. `resolveSystemPromptAndModel()` wraps it for the chat turn, and
`AgentBrandContextSnapshotService` wraps it for the read-only snapshot, so the
Agent context page shows exactly what a turn sees.

Priority order:
1. **Onboarding** -- `source === 'onboarding'` -> onboarding prompt (with brand context)
2. **Brand interview** -- `agentType === BRAND_INTERVIEW` -> `BRAND_INTERVIEW_SYSTEM_PROMPT`
3. **Thread override** -- thread has a custom `systemPrompt`
4. **Request override** -- `request.systemPromptOverride`
5. **Brand context path** (default):
   - Feedback memories via `AgentMemoriesService.getFeedbackMemoriesForGeneration()`
     (max 8, ranked against the message, thread-pinned memories included);
     injected as a separate system message (`buildMemoryPromptSections`)
   - Brand context via `AgentContextAssemblyService.assembleContext()` with layers:
     ```typescript
     {
       brandGuidance: true, brandIdentity: true, brandMemory: true,
       performancePatterns: true, ragContext: true, recentPosts: true,
       // brandKnowledge: default true (DEFAULT_LAYERS)
     }
     ```
   - `ragContext` = brand-scoped saved context (`## Retrieved Brand Memory`);
     `brandKnowledge` = BRAND_TRUTH Knowledge only (`## Brand Knowledge`). Both
     need the message text as query. There is no `knowledgeBase` layer.
   - Rendered by `AgentContextAssemblyService.renderSystemPrompt()` under the
     6000-char `BRAND_CONTEXT_CHARACTER_BUDGET` with a per-section report.
6. **Fallback** -- base prompt + agent type suffix / reply style

**Model resolution order** (first match wins): `strategy.model` ->
`policy.thinkingModelOverride` (org settings) -> `agentTypeConfig.defaultModel`
-> registry default (`LLM_DEFAULTS.agentChat`, DeepSeek V4 Flash). Then
`AgentModelAccessService.enforceModel()` pins unsubscribed hosted orgs to
`LLM_DEFAULTS.agentChat` unless a BYOK key pays for the route.

## Synchronous Chat Loop

**Method:** `executeSynchronousChatLoop()`

```
while (round < AGENT_MAX_TOOL_ROUNDS):  // 25 (verified 2026-09-25)
  round++

  LLM call, wrapped in runReservedAgentLlmRound() (2026-09-25):
    hold the round's maximum estimate -> run -> settle the exact provider
    cost as fractional credits (BYOK / waived rounds settle 0)
    model: selected
    max_tokens: 4096
    temperature: 0.7
    tool_choice: 'auto'
    tools: filtered by agent type
    messages: system + memories + history (max 20)

  If NO tool_calls -> FINAL RESPONSE:
    - (LLM rounds are already settled per round; no separate turn charge)
    - Build metadata (isFallback, memoryEntries, reasoning, riskLevel, uiActions)
    - Save assistant message
    - Return AgentChatResult

  If tool_calls present -> TOOL LOOP:
    For each tool call:
      1. Parse JSON arguments
      2. Validate tool is allowed for agent type
         - If unknown: attempt recovery (remap to PREPARE_GENERATION)
         - If no recovery: return error tool result
      3. Check generation prep override (GENERATE_IMAGE/VIDEO -> PREPARE_GENERATION)
      4. Check credit availability for tool cost
      5. Execute via AgentToolExecutorService
      6. Collect UI actions, risk levels, confirmation requirements
      7. Deduct credits if success + cost > 0
      8. Push tool result to message history for next LLM call
```

## Streaming Chat Flow

**Method:** `chatStream()`

Different from sync:
1. Creates a `WorkflowExecution` record upfront
2. Returns immediately with `{ threadId, runId, startedAt }`
3. Background task runs `runStreamLoop()` in exclusive thread lane
4. Same tool loop as sync, but with Redis event publishing at each checkpoint

**Token streaming is simulated**:
```typescript
const words = content.split(/(\s+)/);
for (const word of words) {
  await this.streamPublisher.publishToken({ token: word, ... });
}
```

The LLM returns a complete response. The service splits it into words and publishes each as an `agent:token` event via Redis. This is NOT incremental model output streaming.

**Cancellation:** Streaming loop checks `isRunCancelled()` at multiple points during execution.

**Redis resilience:** All `publishToken/publishToolStart/etc.` calls wrapped in try/catch -- Redis failures are non-fatal to the main loop.

## Stream Publisher Events

**File:** `apps/server/api/src/services/agent-orchestrator/agent-stream-publisher.service.ts`

**Redis Channel:** `agent-chat`

Each publish method does dual writes:
1. Persists to `agent_thread_events` via `AgentThreadEngineService`
2. Publishes to Redis for real-time fan-out to WebSocket subscribers

| Method | Redis Event | Thread Event Type |
|--------|------------|-------------------|
| `publishStreamStart()` | `agent:stream_start` | `thread.turn_started` |
| `publishToken()` | `agent:token` | `assistant.delta` |
| `publishReasoning()` | `agent:reasoning` | `work.updated` |
| `publishToolStart()` | `agent:tool_start` | `tool.started` |
| `publishToolComplete()` | `agent:tool_complete` | `tool.completed` |
| `publishDone()` | `agent:done` | `assistant.finalized` + `run.completed` |
| `publishError()` | `agent:error` | `error.raised` |
| `publishUIBlocks()` | `agent:ui_blocks` | `ui.blocks_updated` |
| `publishWorkEvent()` | `agent:work_event` | `work.*` |
| `publishInputRequest()` | `agent:input_request` | `input.requested` |
| `publishInputResolved()` | `agent:input_resolved` | `input.resolved` |
| `publishRunStart()` | `agent:run_start` | -- |
| `publishRunProgress()` | `agent:run_progress` | -- |
| `publishRunComplete()` | `agent:run_complete` | -- |
| `publishToolProgress()` | `agent:tool_progress` | `tool.progress` |

## Tool Recovery & Remapping

When the LLM calls a tool not in the agent type's allowed list:

1. **Unknown tool recovery** (`getUnknownToolRecovery()`): If LLM requests `GENERATE_IMAGE/VIDEO/AS_IDENTITY` but only `PREPARE_GENERATION` is available -> remap
2. **Generation prep override** (`getGenerationPreparationOverride()`): Force `GENERATE_*` -> `PREPARE_GENERATION` for user confirmation of model/format before running
3. **Param recovery** (`buildUnknownToolRecoveryParams()`): Extracts prompt from various param names, adds `generationType`

## Module Dependencies

**File:** `apps/server/api/src/services/agent-orchestrator/agent-orchestrator.module.ts`

25+ module imports (all via `forwardRef()`): AgentCampaigns, AgentContextAssembly, AgentMemories, AgentMessages, AgentMessageBus, AgentSpawn, AgentStreamPublisher, AgentThreads, AgentThreading, Analytics, BatchGeneration, Brands, Campaigns, Auth, ContentIntelligence, ContentQuality, Credentials, Credits, Images, KnowledgeBases, LlmDispatcher, OrganizationSettings, Organizations, Posts, Settings, Tasks, Trends, Users, Voices, Workflows, WorkflowExecutions, Config, Logger, HttpModule

## Key Constants

| Constant | Value |
|----------|-------|
| `DEFAULT_MODEL` | `deepseek/deepseek-chat` |
| `LOCAL_DEFAULT_MODEL` | `local/qwen-32b` |
| `AGENT_MAX_TOOL_ROUNDS` | 5 |
| `AGENT_BASE_TURN_COST` | 1 credit |
| Max tokens per LLM call | 4096 |
| Temperature | 0.7 |
| Message history limit | 20 messages |
| Memory limit per prompt | 8 entries |
