# Agent MongoDB Collections

## AgentRoom (Thread Metadata)

**File:** `apps/server/api/src/collections/agent-threads/schemas/agent-thread.schema.ts`
**Collection:** `rooms`

```typescript
{
  user: ObjectId                     // thread owner
  organization: ObjectId
  title?: string
  source?: string                    // 'web', 'api', 'mobile'
  status: AgentThreadStatus          // ACTIVE | ARCHIVED
  systemPrompt?: string              // custom system prompt override
  parentThreadId?: string            // for branched threads
  memoryEntryIds?: string[]          // pinned agent memory references
  isDeleted: boolean
}
```

**Index:** `idx_user_threads` on `{ isDeleted, organization, updatedAt, user }`

**Service:** `AgentThreadsService`
- `getUserThreads(userId, orgId, status?)` -- list threads
- `archiveThread(threadId, orgId)` / `unarchiveThread()`
- `updateThreadMetadata(threadId, orgId, { title, systemPrompt, memoryEntryIds })`
- `branchThread(threadId, orgId, userId)` -- creates new thread + copies all messages

**Controller endpoints:**

| Method | Path | Operation |
|--------|------|-----------|
| `GET` | `/` | List user threads (filter by status) |
| `GET` | `/:threadId` | Get thread by ID |
| `POST` | `/` | Create new thread |
| `POST` | `/:threadId/messages` | Add message |
| `POST` | `/:threadId/branches` | Branch thread |
| `PATCH` | `/:threadId` | Update metadata or status |

---

## AgentMessage

**File:** `apps/server/api/src/collections/agent-messages/schemas/agent-message.schema.ts`
**Collection:** `messages`

```typescript
{
  room: ObjectId                     // -> AgentRoom
  organization: ObjectId
  user: string
  brand?: ObjectId
  role: AgentMessageRole             // USER | ASSISTANT | SYSTEM | TOOL
  content?: string
  toolCallId?: string
  toolCalls?: ToolCall[]
  metadata?: Record<string, unknown>
  isDeleted: boolean
}
```

**ToolCall sub-schema:**
```typescript
{
  toolName: string
  parameters?: Record<string, unknown>
  result?: Record<string, unknown>
  status?: string
  creditsUsed?: number
  durationMs?: number
  error?: string
}
```

**Service:** `AgentMessagesService`
- `addMessage(dto)` -- persist message with tool calls
- `getMessagesByRoom(roomId, orgId, { limit, page })` -- default limit 50, page 1, sorted by createdAt desc
- `getRecentMessages(roomId, limit?)` -- default limit 20, chronological (for LLM context)
- `copyMessages(sourceRoom, targetRoom, orgId)` -- for thread branching

---

## AgentRun (Execution Tracking)

**File:** `apps/server/api/src/collections/agent-runs/schemas/agent-run.schema.ts`
**Collection:** `agent_runs`

```typescript
{
  organization: ObjectId
  user: ObjectId
  trigger: AgentExecutionTrigger     // MANUAL | SCHEDULED | EVENT | AUTO
  status: AgentExecutionStatus       // PENDING | RUNNING | COMPLETED | FAILED | CANCELLED
  strategy?: ObjectId
  thread?: ObjectId                  // associated thread (optional)
  parentRun?: ObjectId               // for nested runs
  label: string                      // display name
  objective?: string
  toolCalls: AgentRunToolCall[]      // completed tool invocations
  summary?: string
  creditsUsed: number
  creditBudget?: number
  startedAt?: Date
  completedAt?: Date
  durationMs?: number
  error?: string
  retryCount: number
  progress: number                   // 0-100
  metadata?: Record<string, unknown>
  isDeleted: boolean
}
```

**AgentRunToolCall sub-schema:**
```typescript
{
  toolName: string
  status: 'completed' | 'failed'
  creditsUsed: number
  durationMs: number
  error?: string
  executedAt: Date
}
```

**Service:** `AgentRunsService`
- `start(id, orgId)` -- sets status=RUNNING, startedAt=now
- `getById(id, orgId)` -- retrieve single run
- `isCancelled(id, orgId)` -- polled during streaming loop
- `recordToolCall(id, orgId, toolCall)` -- appends to toolCalls array, increments creditsUsed
- `updateProgress(id, orgId, progress)` -- clamps progress to [0, 100]
- `getActiveRuns(orgId)` / `getByThread(threadId, orgId)`
- `getStats(orgId)` -> `{ totalRuns, activeRuns, completedToday, failedToday, totalCreditsToday }`
- `getRunContent(runId, orgId)` -> `{ posts, ingredients }`

---

## AgentMemory

**File:** `apps/server/api/src/collections/agent-memories/schemas/agent-memory.schema.ts`
**Collection:** `agent_memories`

```typescript
{
  organization: ObjectId
  user: string
  content: string                    // memory text
  kind: 'preference' | 'positive_example' | 'negative_example' | 'winner' | 'reference' | 'instruction' | 'pattern'
  scope: 'user' | 'brand'           // default: 'user'
  contentType: 'newsletter' | 'tweet' | 'thread' | 'article' | 'post' | 'generic'
  sourceMessageId?: string
  brand?: ObjectId
  platform?: string
  sourceType?: string
  sourceUrl?: string
  sourceContentId?: string
  importance: number                 // 0-1, default 0.5
  confidence: number                 // 0-1, default 0.5
  performanceSnapshot?: Record<string, unknown>
  tags?: string[]
  summary?: string
}
```

**Service:** `AgentMemoriesService`
- `getMemoriesForPrompt(userId, orgId, { query?, contentType?, brandId?, pinnedMemoryIds?, limit? })`
  - Fetches up to 200 candidates, ranks by multi-factor scoring, returns top K (default 8)
  - Scoring: pinned (+100) > brand match (+5) > contentType exact (+8) or generic (+1) > kind bonus (winner/pattern +4, instruction/preference +3) > importance x 4 > confidence x 2 > query term matches (x 3 each) > minimum +1
- `listForUser(userId, orgId, { limit? })` -- default limit 100, sorted by createdAt desc
- `createMemory(userId, orgId, payload)` -- normalizes kind/scope/contentType, clamps importance/confidence to [0,1]
- `removeMemory(memoryId, userId, orgId)`

**Memory in system prompt** -- organized into 5 sections:
1. User Preferences (kind: preference)
2. Saved Instructions (kind: instruction, default)
3. Winning Patterns (kind: winner, pattern)
4. Reference Examples (kind: reference, positive_example)
5. Avoid These Patterns (kind: negative_example)

Format: `- [content_type / platform / scope] snippet (max 220 chars)`
