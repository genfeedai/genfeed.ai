# Agent Threading & Event Sourcing

> **Last verified:** 2026-06-29 against `apps/server/api/src/services/agent-threading/` and `packages/prisma/prisma/schema.prisma`.

**Directory:** `apps/server/api/src/services/agent-threading/`

Agent threading now persists through Prisma/Postgres. The `schemas/*.schema.ts` files in this directory are compatibility document types around Prisma rows and snapshot JSON, not Mongoose collection schemas.

## Module Exports

- `AgentThreadEngineService` -- event appending + snapshot management
- `AgentThreadProjectorService` -- event -> snapshot projection
- `AgentRuntimeSessionService` -- session binding CRUD stored in `AgentThreadSnapshot.data.sessionBinding`
- `AgentExecutionLaneService` -- in-memory concurrency control
- `AgentProfileResolverService` -- agent profile resolution
- `ThreadContextCompressorService` -- thread context compaction state

## Persistence Records

| Prisma record | Backing table | Purpose |
|---|---|---|
| `AgentThreadEvent` | `agent_thread_events` | Immutable event log |
| `AgentThreadSnapshot` | `agent_thread_snapshots` | Projected state from events; JSON payload holds runtime/session/profile/input state |
| `ThreadContextState` | `thread_context_states` | Thread context compression state |

Runtime/session bindings, input requests, and profile snapshots are not standalone Prisma tables in the current schema. Current services adapt them into document-like shapes from `AgentThreadSnapshot.data`.

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

- Appends an `AgentThreadEvent` row with a sequence guarantee.
- Uses `commandId` for idempotency where supplied.
- Increments `lastSequence` in projected snapshot data.
- Projects the event into `AgentThreadSnapshot.data` via `AgentThreadProjectorService`.

**Side effects on session binding stored in snapshot JSON:**

- `input.requested` -> status = `waiting_input`, appends an input request to `data.inputRequests[]`
- `thread.turn_started`, `work.started`, `tool.started`, `tool.progress` -> status = `running`
- `input.resolved` -> status = `running`
- `run.cancelled` -> status = `cancelled`
- `run.completed`, `assistant.finalized`, `work.completed` -> status = `completed`
- `run.failed`, `error.raised` -> status = `failed`

### `resolveInputRequest(params)`

Marks an input request inside `AgentThreadSnapshot.data.inputRequests[]` as resolved with answer + timestamp.

### `recordProfileSnapshot(threadId, organizationId, snapshot)`

Stores agent profile data under `AgentThreadSnapshot.data.profileSnapshot`.

### `recordMemoryFlush(threadId, organizationId, userId, content, tags)`

Persists thread conversation summary to memory and returns a memory ID.

## AgentThreadProjectorService

**Core method:** `applyEvent(snapshot, event) -> MutableSnapshot`

Projects each event type into snapshot data:

| Event | Snapshot Update |
|-------|----------------|
| `thread.turn_requested` | `activeRun = { status: 'queued' }` |
| `thread.turn_started` / `work.started` | `activeRun = { status: 'running' }` |
| `assistant.finalized` | `lastAssistantMessage = { messageId, content, metadata }` |
| `input.requested` | Appends to `pendingInputRequests[]` and `inputRequests[]` |
| `input.resolved` | Removes matching `requestId` from `pendingInputRequests[]` |
| `plan.upserted` | `latestProposedPlan = { id, content, steps }` |
| `ui.blocks_updated` | `latestUiBlocks = { operation, blocks, blockIds }` |
| `run.*` / `work.completed` / `error.raised` | `activeRun.completedAt` + status |
| `memory.flushed` | Appends `memoryId` to `memorySummaryRefs[]` |
| `tool.started` / `tool.progress` | `activeRun.status = 'running'` |
| `tool.completed` | `activeRun.status = 'running'` or `'failed'` if `payload.status='failed'` |

**Timeline:** Max 250 entries (oldest dropped). Each entry has `id`, `kind`, `label`, `detail`, `status`, `createdAt`, `sequence`, and optional `runId`, `toolName`, `requestId`, `role`, `payload`.

**Timeline entry kinds:** `'assistant'`, `'input'`, `'message'`, `'plan'`, `'tool'`, `'work'`, `'system'`, `'error'`

## AgentThreadSnapshot

**Prisma model:** `AgentThreadSnapshot`
**Table:** `agent_thread_snapshots`

Canonical row fields:

```typescript
{
  id: string
  mongoId?: string
  organizationId: string
  threadId: string
  data: Json
  isDeleted: boolean
  createdAt: Date
  updatedAt: Date
}
```

**Index:** `@@unique([organizationId, threadId])`

Snapshot `data` contains the projected thread state:

```typescript
{
  lastSequence: number
  title?: string
  source?: string
  threadStatus?: string
  activeRun?: { runId, model, status, startedAt, completedAt }
  pendingApprovals?: AgentPendingApproval[]
  pendingInputRequests?: AgentPendingInputRequest[]
  inputRequests?: Record<string, unknown>[]
  latestProposedPlan?: { id, content, explanation, steps, createdAt, updatedAt }
  latestUiBlocks?: { operation, blocks, blockIds, updatedAt }
  lastAssistantMessage?: { messageId, content, metadata, createdAt }
  memorySummaryRefs?: string[]
  timeline?: AgentThreadTimelineEntry[]
  sessionBinding?: Record<string, unknown>
  profileSnapshot?: Record<string, unknown>
}
```

## AgentRuntimeSessionService

Stores runtime/session state inside `AgentThreadSnapshot.data.sessionBinding` and adapts it to `AgentSessionBindingDocument` for callers.

```typescript
{
  organizationId: string
  threadId: string
  runId?: string
  model?: string
  status: 'idle' | 'running' | 'waiting_input' | 'completed' | 'failed' | 'cancelled'
  resumeCursor?: Record<string, unknown>
  activeCommandId?: string
  lastSeenAt?: string
  metadata?: Record<string, unknown>
}
```

## AgentExecutionLaneService

In-memory concurrency control using promise chains.

```typescript
async runExclusive<T>(laneKey: string, task: () => Promise<T>): Promise<T>
```

Maintains `Map<string, Promise<unknown>>`; tasks on the same lane execute sequentially. Used with key `thread:{threadId}` to serialize concurrent mutations on the same thread.

## AgentProfileResolverService

Resolves agent configuration from context:

```typescript
resolve(context: { agentType?, campaignId?, strategyId? }): {
  agentType?: string
  campaignId?: string
  strategyId?: string
  routeKey: string
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
