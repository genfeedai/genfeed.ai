# Agent Persistence Records

> **Last verified:** 2026-06-29 against `packages/prisma/prisma/schema.prisma` and agent collection services.

Storage source of truth is Prisma/Postgres. Files under `apps/server/api/src/collections/agent-*/schemas/` are TypeScript compatibility wrappers around Prisma types, not Mongoose schemas. Some wrappers still expose legacy aliases such as `_id`, `organization`, `user`, and `room`; service writes should use canonical Prisma fields (`id`, `organizationId`, `userId`, `threadId`, `brandId`, etc.).

## AgentThread

**Prisma model:** `AgentThread`
**Table:** `agent_threads`
**Compatibility type:** `AgentRoomDocument`

Canonical fields:

```typescript
{
  id: string
  mongoId?: string
  userId: string
  organizationId: string
  title?: string
  status?: string
  config: Json
  isDeleted: boolean
  createdAt: Date
  updatedAt: Date
}
```

**Service:** `AgentThreadsService`

- `getUserThreads(userId, organizationId, status?)`
- `archiveThread(threadId, organizationId)` / `unarchiveThread()`
- `updateThreadMetadata(threadId, organizationId, payload)`
- `branchThread(threadId, organizationId, userId)` creates a new thread and copies messages

**Controller endpoints:**

| Method | Path | Operation |
|--------|------|-----------|
| `GET` | `/` | List user threads (filter by status) |
| `GET` | `/:threadId` | Get thread by ID |
| `POST` | `/` | Create new thread |
| `POST` | `/:threadId/messages` | Add message |
| `POST` | `/:threadId/branches` | Branch thread |
| `PATCH` | `/:threadId` | Update metadata or status |

## AgentMessage

**Prisma model:** `AgentMessage`
**Table:** `agent_messages`

Canonical fields:

```typescript
{
  id: string
  mongoId?: string
  threadId: string
  organizationId: string
  userId?: string
  brandId?: string
  role: string
  content?: string
  toolCalls?: Json
  toolResults?: Json
  metadata?: Json
  isDeleted: boolean
  createdAt: Date
  updatedAt: Date
}
```

**Indexes:** `@@index([organizationId, threadId, isDeleted, createdAt(sort: Desc), id])`, `@@index([threadId, isDeleted, id])`

**Service:** `AgentMessagesService`

- `addMessage(dto)` maps compatibility `room` to canonical `threadId`
- `getMessagesByRoom(roomId, organizationId, { limit, page, cursor })`
- `getRecentMessages(roomId, limit?)`
- `copyMessages(sourceRoom, targetRoom, organizationId)`

## AgentRun

**Prisma model:** `AgentRun`
**Table:** `agent_runs`

Canonical fields:

```typescript
{
  id: string
  mongoId?: string
  organizationId: string
  userId: string
  strategyId?: string
  threadId?: string
  parentRunId?: string
  status: AgentRunStatus
  type?: string
  config: Json
  result?: Json
  error?: string
  metadata: Json
  label?: string
  objective?: string
  trigger?: string
  creditsUsed: number
  durationMs?: number
  isDeleted: boolean
  createdAt: Date
  updatedAt: Date
}
```

**Indexes:** organization/status/thread scoped Prisma indexes in `schema.prisma`.

**Service:** `AgentRunsService`

- `start(id, organizationId)` sets status to `RUNNING`
- `getById(id, organizationId)`
- `isCancelled(id, organizationId)`
- `getActiveRuns(organizationId)` / `getByThread(threadId, organizationId)`
- `getStats(organizationId)`
- `getRunContent(runId, organizationId)`

## AgentMemory

**Prisma model:** `AgentMemory`
**Table:** `agent_memories`

Canonical fields:

```typescript
{
  id: string
  mongoId?: string
  organizationId: string
  userId: string
  brandId?: string
  campaignId?: string
  content?: string
  type?: string
  metadata?: Json
  scope?: string
  kind?: string
  contentType?: string
  platform?: string
  summary?: string
  tags: string[]
  sourceType?: string
  sourceUrl?: string
  sourceContentId?: string
  sourceMessageId?: string
  importance?: number
  confidence?: number
  performanceSnapshot?: Json
  createdAt: Date
  updatedAt: Date
}
```

**Service:** `AgentMemoriesService`

- `getMemoriesForPrompt(userId, organizationId, { query?, contentType?, brandId?, pinnedMemoryIds?, limit? })`
  - Fetches candidates, ranks by pinned status, brand/content match, kind, importance/confidence, query terms, and recency.
- `listForUser(userId, organizationId, { limit? })`
- `createMemory(userId, organizationId, payload)`
- `getCampaignMemories(campaignId, organizationId, contentType?)`
- `saveCampaignMemory(userId, organizationId, campaignId, payload)`
- `removeMemory(memoryId, userId, organizationId)`

**Memory in system prompt** is organized into five sections:

1. User Preferences (`kind: preference`)
2. Saved Instructions (`kind: instruction`, default)
3. Winning Patterns (`kind: winner`, `pattern`)
4. Reference Examples (`kind: reference`, `positive_example`)
5. Avoid These Patterns (`kind: negative_example`)

Format: `- [content_type / platform / scope] snippet (max 220 chars)`
