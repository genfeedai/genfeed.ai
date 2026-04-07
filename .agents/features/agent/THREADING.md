# Agent Threading & Event Sourcing

**Directory:** `apps/server/api/src/services/agent-threading/`

## Module Exports

- `AgentThreadEngineService` -- event appending + snapshot management
- `AgentThreadProjectorService` -- event -> snapshot projection
- `AgentRuntimeSessionService` -- session binding CRUD
- `AgentExecutionLaneService` -- in-memory concurrency control
- `AgentProfileResolverService` -- agent profile resolution

## Collections

| Collection | Schema | Purpose |
|-----------|--------|---------|
| `agent_thread_events` | AgentThreadEvent | Immutable event log (event sourcing) |
| `agent_thread_snapshots` | AgentThreadSnapshot | Projected state from events |
| `agent_session_bindings` | AgentSessionBinding | Runtime/session state (runId, model, status, resumeCursor, activeCommandId) |
| `agent_input_requests` | AgentInputRequest | Pending/resolved user input requests |
| `agent_profile_snapshots` | AgentProfileSnapshot | Agent config snapshot (tools, prompts, memory policy) |

All on `DB_CONNECTIONS.AGENT` (separate MongoDB connection).

## Event Types (19)

```
thread.turn_requested    thread.turn_started
assistant.delta          assistant.finalized
tool.started             tool.progress           tool.completed
input.requested          input.resolved
plan.upserted            ui.blocks_updated
run.cancelled            run.completed            run.failed
memory.flushed
work.started             work.updated             work.completed
error.raised
```

## AgentThreadEngineService

**Key methods:**

### `appendEvent(params)`
- Appends event to `agent_thread_events` with sequence guarantee
- Uses `commandId` for idempotency (returns existing event if duplicate)
- Increments `lastSequence` atomically on the snapshot
- Projects event into snapshot via `AgentThreadProjectorService`

**Side effects on session binding:**
- `input.requested` -> status = `waiting_input`, creates `AgentInputRequest` doc
- `thread.turn_started`, `work.started`, `tool.started`, `tool.progress` -> status = `running`
- `input.resolved` -> status = `running`
- `run.cancelled` -> status = `cancelled`
- `run.completed`, `assistant.finalized`, `work.completed` -> status = `completed`
- `run.failed`, `error.raised` -> status = `failed`

### `resolveInputRequest(params)`
Marks `AgentInputRequest` as resolved with answer + timestamp.

### `recordProfileSnapshot(threadId, orgId, snapshot)`
Upserts agent profile (tools, prompts, memory policy) for the thread.

### `recordMemoryFlush(threadId, orgId, userId, content, tags)`
Persists thread conversation summary to memory, returns memory ID.

## AgentThreadProjectorService

**Core method:** `applyEvent(snapshot, event) -> MutableSnapshot`

Projects each event type into the snapshot state:

| Event | Snapshot Update |
|-------|----------------|
| `thread.turn_requested` | `activeRun = { status: 'queued' }` |
| `thread.turn_started` / `work.started` | `activeRun = { status: 'running' }` |
| `assistant.finalized` | `lastAssistantMessage = { messageId, content, metadata }` |
| `input.requested` | Appends to `pendingInputRequests[]` |
| `input.resolved` | Removes matching `requestId` from `pendingInputRequests[]` |
| `plan.upserted` | `latestProposedPlan = { id, content, steps }` |
| `ui.blocks_updated` | `latestUiBlocks = { operation, blocks, blockIds }` |
| `run.*` / `work.completed` / `error.raised` | `activeRun.completedAt` + status |
| `memory.flushed` | Appends `memoryId` to `memorySummaryRefs[]` |
| `tool.started` / `tool.progress` | `activeRun.status = 'running'` |
| `tool.completed` | `activeRun.status = 'running'` (or `'failed'` if `payload.status='failed'`) |

**Timeline:** Max 250 entries (oldest dropped). Each entry has: `id`, `kind`, `label`, `detail`, `status`, `createdAt`, `sequence`, optional `runId`, `toolName`, `requestId`, `role`, `payload`.

**Timeline entry kinds:** `'assistant'`, `'input'`, `'message'`, `'plan'`, `'tool'`, `'work'`, `'system'`, `'error'`

## AgentThreadSnapshot Schema

**Collection:** `agent_thread_snapshots`

```typescript
{
  organization: ObjectId
  thread: ObjectId          // unique with org
  lastSequence: number      // highest event sequence processed
  title?: string
  source?: string
  threadStatus?: string
  activeRun?: { runId, model, status, startedAt, completedAt }
  pendingApprovals: AgentPendingApproval[]  // { requestId, requestKind, detail?, createdAt }
  pendingInputRequests: AgentPendingInputRequest[]  // { requestId, title, prompt, allowFreeText?, recommendedOptionId?, options[], fieldId?, metadata?, createdAt }
  latestProposedPlan?: { id, content, explanation, steps, createdAt, updatedAt }
  latestUiBlocks?: { operation, blocks, blockIds, updatedAt }
  lastAssistantMessage?: { messageId, content, metadata, createdAt }
  memorySummaryRefs: string[]
  timeline: AgentThreadTimelineEntry[]  // max 250
  sessionBinding?: Record<string, unknown>
  profileSnapshot?: Record<string, unknown>
  isDeleted: boolean
}
```

Index: `{ organization: 1, thread: 1 }` -- UNIQUE

## AgentSessionBinding Schema

**Collection:** `agent_session_bindings`

Stores runtime/session state for active agent execution. Does NOT store user/brand context -- that lives in the thread and profile snapshot.

```typescript
{
  organization: ObjectId
  thread: ObjectId
  runId?: string
  model?: string
  status: 'idle' | 'running' | 'waiting_input' | 'completed' | 'failed' | 'cancelled'
  resumeCursor?: Record<string, unknown>   // checkpointing position
  activeCommandId?: string                 // currently executing command
  lastSeenAt?: string                      // last activity timestamp
  metadata?: Record<string, unknown>
  isDeleted: boolean
}
```

Index: `{ organization: 1, thread: 1 }` -- UNIQUE

## AgentExecutionLaneService

In-memory concurrency control using promise chains.

```typescript
async runExclusive<T>(laneKey: string, task: () => Promise<T>): Promise<T>
```

Maintains `Map<string, Promise<unknown>>` -- tasks on the same lane execute sequentially. Used with key `thread:{threadId}` to serialize concurrent mutations on the same thread.

## AgentProfileResolverService

Resolves agent configuration from context:

```typescript
resolve(context: { agentType?, campaignId?, strategyId? }): {
  agentType?: string
  campaign?: ObjectId
  strategy?: ObjectId
  routeKey: string              // "agentType:campaignId:strategyId"
  enabledTools: string[]
  promptFragments: string[]
  hooks: { before_prompt_build, after_tool_call, before_tool_call, session_end }
  memoryPolicy: { scope: 'thread', autoFlushOnArchive/Branch/Compaction/Reset: true }
  outputRules: { safeMarkdownOnly: true, separateWorkLog: true }
}
```

## Controller Endpoints

**File:** `apps/server/api/src/services/agent-threading/controllers/agent-threads.controller.ts`

| Method | Path | Operation |
|--------|------|-----------|
| `GET` | `:threadId/snapshot` | Get projected thread state |
| `GET` | `:threadId/events` | List events (optional `afterSequence` filter) |
| `POST` | `:threadId/input-requests/:requestId/responses` | Resolve user input |
| `POST` | `:threadId/branches` | Branch thread (with memory flush) |
