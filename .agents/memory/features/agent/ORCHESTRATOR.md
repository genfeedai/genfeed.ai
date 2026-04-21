# Agent Orchestrator

**File:** `apps/server/api/src/services/agent-orchestrator/agent-orchestrator.service.ts`

## Controller Endpoints

**File:** `apps/server/api/src/services/agent-orchestrator/agent-orchestrator.controller.ts`

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/agent/chat` | Synchronous chat (waits for full response) |
| `POST` | `/agent/chat/stream` | Streaming chat (returns `{ threadId, runId, startedAt }`, events via Redis) |
| `GET` | `/agent/credits` | Credits balance + per-model turn costs |

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

**Method:** `resolveSystemPromptAndModel()`

Priority order:
1. **Onboarding** -- if `source === 'onboarding'` OR first run -> `ONBOARDING_SYSTEM_PROMPT`
2. **Thread override** -- if thread has custom `systemPrompt`
3. **Request override** -- if `request.systemPromptOverride` set
4. **Brand context path** (default):
   - Memories resolved separately via `AgentMemoriesService.getMemoriesForPrompt()` (max 8, ranked by relevance)
   - Brand context assembled via `AgentContextAssemblyService.assembleContext()` with explicit layers:
     ```typescript
     { brandIdentity: true, brandMemory: true, knowledgeBase: true }
     ```
   - `recentPosts` and `performancePatterns` default to `false` and are NOT enabled in this path
   - System prompt built from `SYSTEM_PROMPT + agentTypeConfig.systemPromptSuffix + replyStyle`
5. **Fallback** -- base `SYSTEM_PROMPT` + agent type suffix

**Model resolution order:** `request.model` -> `subscriptionDefaultModel` (local/qwen-32b for PAID tiers: CREATOR, PRO, SCALE, ENTERPRISE) -> `brandContext.defaultModel` -> `agentTypeConfig.defaultModel` -> `DEFAULT_MODEL` (deepseek/deepseek-chat)

## Synchronous Chat Loop

**Method:** `executeSynchronousChatLoop()`

```
while (round < 5):  // AGENT_MAX_TOOL_ROUNDS
  round++

  LLM call:
    model: selected
    max_tokens: 4096
    temperature: 0.7
    tool_choice: 'auto'
    tools: filtered by agent type
    messages: system + memories + history (max 20)

  If NO tool_calls -> FINAL RESPONSE:
    - Deduct turn cost credits
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
1. Creates `AgentRun` record upfront
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

25+ module imports (all via `forwardRef()`): AgentCampaigns, AgentContextAssembly, AgentMemories, AgentMessages, AgentMessageBus, AgentRuns, AgentSpawn, AgentStreamPublisher, AgentThreads, AgentThreading, Analytics, BatchGeneration, Brands, Campaigns, Clerk, ContentIntelligence, ContentQuality, Credentials, Credits, Images, KnowledgeBases, LlmDispatcher, OrganizationSettings, Organizations, Posts, Settings, Tasks, Trends, Users, Voices, Workflows, WorkflowExecutions, Config, Logger, HttpModule

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
