# Agent Persistence Records

> **Last verified:** 2026-09-07 against `packages/prisma/prisma/schema.prisma`,
> the agent collection controllers, and their services.

Storage source of truth is Prisma/Postgres. Files under
`apps/server/api/src/collections/agent-*/schemas/` are thin TypeScript wrappers that
re-export the Prisma model type, sometimes widening a `Json` column to an object shape
(`AgentRoomDocument`, `AgentMemoryDocument`). They declare no fields of their own.

**Field lists live in `schema.prisma`, not here.** This file records the durable shape —
services, endpoints, and ranking behavior — that a reader cannot recover from the schema
alone. Read the model block in `schema.prisma` for the current columns.

Every agent model carries `id` (cuid), `organizationId`, `createdAt`, and `updatedAt`.
`AgentThread` and `AgentMessage` also carry `isDeleted`; `AgentMemory` has no soft-delete
column and is hard-deleted by `removeMemory`.

## AgentThread

**Prisma model:** `AgentThread` · **Table:** `agent_threads` ·
**Wrapper:** `AgentRoomDocument` (widens `config` to `Record<string, unknown>`)

**Service:** `AgentThreadsService`

- `getUserThreads(userId, organizationId, status?)`
- `archiveThread(threadId, organizationId)` / `unarchiveThread()` / `archiveAllThreads()`
- `updateThreadMetadata(threadId, organizationId, payload)`
- `branchThread(threadId, organizationId, userId)` creates a new thread and copies messages
- `listAgentRuns(...)` backs the separate `agent/runs` controller

**Controllers:** `agent/threads` (`AgentThreadsController`) and `agent/runs`
(`AgentRunsController`).

| Method | Path | Operation |
|--------|------|-----------|
| `GET` | `/agent/threads` | List user threads (filter by status) |
| `POST` | `/agent/threads` | Create new thread |
| `PATCH` | `/agent/threads` | Bulk update |
| `GET` | `/agent/threads/:threadId` | Get thread by ID |
| `PATCH` | `/agent/threads/:threadId` | Update metadata or status |
| `PATCH` | `/agent/threads/:threadId/context` | Update thread context |
| `GET` | `/agent/threads/:threadId/messages` | List thread messages |
| `POST` | `/agent/threads/:threadId/messages` | Add message |
| `GET` | `/agent/threads/:threadId/messages/:messageId` | Get one thread message |
| `GET` | `/agent/threads/:threadId/messages/:messageId/artifact-references` | Resolve artifact references |
| `GET` | `/agent/runs` | List agent runs |

## AgentMessage

**Prisma model:** `AgentMessage` · **Table:** `agent_messages`

**Indexes:** `@@index([organizationId, threadId, isDeleted, createdAt(sort: Desc), id(sort: Desc)])`,
`@@index([threadId, isDeleted, id])`

**Service:** `AgentMessagesService`. The service still uses `room` in its parameter names
as a synonym for the thread; writes go to the canonical `threadId` column.

- `addMessage(dto)` maps the compatibility `room` field to canonical `threadId`
- `getMessagesByRoom(roomId, organizationId, { limit, page, cursor })` / `getMessagesPage`
- `getRecentMessages(roomId, limit?)` / `getMessagesAfter` / `getAllMessages` / `getAllMessagesAfter`
- `countMessages(roomId)` / `countMessagesAfter`
- `copyMessages(sourceRoom, targetRoom, organizationId)`
- `resolveMessageArtifactReferences(...)` backs the artifact-references endpoint

## WorkflowExecution

**Prisma model:** `WorkflowExecution` · **Table:** `workflow_executions`

The `AgentRun` model was deleted in the workflow-only execution hard cut. Agent turns
persist a `WorkflowExecution` row plus per-node `WorkflowExecutionNodeResult`s. There is
no `agent_runs` table — the `agent/runs` endpoint reads threads and executions.

**Indexes:** `@@unique([organizationId, idempotencyKey])`,
`@@index([organizationId, isDeleted, createdAt(sort: Desc)])`

**Service:** `WorkflowExecutionsService` (`apps/server/api/src/collections/workflow-executions/`)

## AgentMemory

**Prisma model:** `AgentMemory` · **Table:** `agent_memories` ·
**Wrapper:** `AgentMemoryDocument` (narrows `contentType`, `kind`, `scope` to their unions)

Enum-like unions live in the schema wrapper, not in Prisma: `AGENT_MEMORY_KINDS`,
`AGENT_MEMORY_SCOPES`, `AGENT_MEMORY_CONTENT_TYPES`.

**Service:** `AgentMemoriesService`

- `getMemoriesForPrompt(userId, organizationId, { query?, contentType?, brandId?, pinnedMemoryIds?, limit? })`
  - Fetches candidates, ranks by pinned status, brand/content match, kind,
    importance/confidence, query terms, and recency.
- `getFeedbackMemoriesForGeneration(...)`
- `listForUser(userId, organizationId, { limit? })`
- `createMemory(userId, organizationId, payload)`
- `getCampaignMemories(campaignId, organizationId, contentType?)`
- `saveCampaignMemory(userId, organizationId, campaignId, payload)`
- `removeMemory(memoryId, userId, organizationId)`

Capture paths are separate services: `AgentMemoryCaptureService.capture(...)` and
`TaskFeedbackMemoryAdapterService.captureFromTaskReview(...)`.

**Memory in system prompt** is organized into five sections:

1. User Preferences (`kind: preference`)
2. Saved Instructions (`kind: instruction`, default)
3. Winning Patterns (`kind: winner`, `pattern`)
4. Reference Examples (`kind: reference`, `positive_example`)
5. Avoid These Patterns (`kind: negative_example`)

Format: `- [content_type / platform / scope] snippet (max 220 chars)`
