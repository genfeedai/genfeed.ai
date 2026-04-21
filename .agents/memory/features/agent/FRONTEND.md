# Agent Frontend Package

**Package:** `packages/agent/`

## Directory Structure

```
packages/agent/src/
├── components/           66 files
│   ├── AgentPanel.tsx              Right sidebar container
│   ├── AgentChatContainer.tsx      Main chat area
│   ├── AgentThreadList.tsx         Thread sidebar (CRUD)
│   ├── AgentChatMessage.tsx        Message rendering
│   ├── AgentToolCallDisplay.tsx    Tool status cards
│   ├── AgentStreamingMessage.tsx   Streaming bubble
│   ├── AgentRunWorkspace.tsx       Activity feed
│   ├── AgentInputRequestOverlay.tsx  User input modal
│   ├── AgentChatInput.tsx          Message input + mentions
│   ├── *Card.tsx                   30+ action cards
│   └── blocks/                     Dynamic UI blocks
├── constants/            3 files
├── dashboard/            3 files
├── extensions/           slash-commands extension
├── hooks/                8 files
├── models/               5 files
├── services/             6 files
├── stores/               6 files
├── utils/                7 files
└── index.ts
```

## State Management (Zustand)

**File:** `packages/agent/src/stores/agent-chat.store.ts`

```typescript
interface AgentChatState {
  // Thread & message data
  activeRunId: string | null
  messages: AgentChatMessage[]
  memoryEntries: AgentMemoryEntry[]
  threads: AgentThread[]
  activeThreadId: string | null

  // Run status
  activeRunStatus: 'idle' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled'
  runStartedAt: string | null

  // UI state
  isOpen: boolean                    // panel collapsed/expanded (localStorage persisted)
  isGenerating: boolean
  error: string | null

  // Credits
  creditsRemaining: number | null
  modelCosts: Record<string, number>

  // Context
  pageContext: AgentPageContext | null
  threadPrompts: Record<string, string | undefined>
  pendingInputRequest: AgentInputRequest | null
  onboardingSteps: OnboardingChecklistStep[]
  workEvents: AgentWorkEvent[]

  // Streaming
  stream: {
    isStreaming: boolean
    streamingContent: string
    streamingReasoning: string
    activeToolCalls: AgentToolCall[]
  }
}
```

**Key actions (30+):** `addMessage`, `setMessages`, `clearMessages`, `setThreads`, `upsertThread`, `setActiveThread`, `setActiveRun`, `setActiveRunStatus`, `addMemoryEntry`, `removeMemoryEntry`, `setMemoryEntries`, `setError`, `setIsGenerating`, `setIsOpen`, `toggleOpen` (localStorage sync), `setCreditsRemaining`, `setModelCosts`, `setPageContext`, `setThreadPrompt`, `setRunStartedAt`, `setWorkEvents`, `setOnboardingStepStatus`, `setPendingInputRequest`, `clearPendingInputRequest`, `appendStreamToken`, `setStreamingReasoning`, `addActiveToolCall`, `updateActiveToolCall`, `finalizeStream`, `resetStreamState`, `addWorkEvent`

## Chat Hooks

### `useAgentChatStream` (Streaming Mode)
**File:** `packages/agent/src/hooks/use-agent-chat-stream.ts`

1. Calls `apiService.chatStream()` → returns `{ threadId, runId, startedAt }`
2. Subscribes to WebSocket events via `useSocketManager`:
   - `agent:stream_start` → `setActiveRun` with timestamp
   - `agent:token` → `appendStreamToken` (words, not incremental model output)
   - `agent:reasoning` → `setStreamingReasoning`
   - `agent:tool_start` → `addActiveToolCall`
   - `agent:tool_complete` → `updateActiveToolCall`
   - `agent:done` → `finalizeStream`, create assistant message
   - `agent:error` → reset stream state, set error
   - `agent:ui_blocks` → `applyDashboardOperation`
   - `agent:work_event` → `addWorkEvent`
   - `agent:input_request` → `setPendingInputRequest`
   - `agent:input_resolved` → `clearPendingInputRequest`

**Event buffering:** Events arriving before `threadId` is resolved are buffered in `bufferedEventsRef`, flushed once thread becomes active. Events filtered by `threadId` for multi-thread safety.

**Completion watchdog:** If stream doesn't complete within 90s grace period, polls `GET /threads/{id}/messages` every 10s to recover the latest assistant message.

### `useAgentChat` (Non-Streaming Mode)
**File:** `packages/agent/src/hooks/use-agent-chat.ts`

Simpler flow: `POST /agent/chat` → waits for full response → adds assistant message.

**`useAgentChatStream` returns:**
```typescript
{
  sendMessage: (content: string, options?: SendStreamMessageOptions) => Promise<void>
  clearChat: () => void
  isStreaming: boolean
}
```

**`useAgentChat` returns:**
```typescript
{
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>
  clearChat: () => void
}
```

## API Service

**File:** `packages/agent/src/services/agent-api.service.ts`

### Chat
- `chat(payload, signal?)` → `POST /agent/chat` — full response
- `chatStream(payload, signal?)` → `POST /agent/chat/stream` — returns `{ threadId, runId, startedAt }`
- `sendMessage(payload, signal?)` → add message to thread
- `respondToInputRequest(threadId, requestId, answer, signal?)` → resolve input request

### Threads
- `createThread(payload, signal?)` / `getThreads(params?, signal?)` / `getThread(threadId, signal?)`
- `getMessages(threadId, params?, signal?)` — paginated message list
- `updateThread(threadId, payload, signal?)` / `archiveThread(threadId, signal?)` / `unarchiveThread(threadId, signal?)`
- `branchThread(threadId, signal?)` — fork thread

### Credits & Runs
- `getCreditsInfo(signal?)` → balance + model costs
- `getActiveRuns(signal?)` / `cancelRun(runId, signal?)`

### Memories
- `listMemories(signal?)` / `createMemory(payload, signal?)` / `deleteMemory(memoryId, signal?)`

### Mentions
- `getMentions(signal?)` → credential mention items for @-mentions in chat input

### Generation & Media
- `generateIngredient(type, body, signal?)` / `mergeVideos(ids, options?, signal?)` / `reframeVideo(...)` / `resizeVideo(...)`
- `cloneVoice(formData, signal?)` / `getClonedVoices(signal?)` / `setBrandVoiceDefaults(brandId, payload, signal?)`

### Models & Workflows
- `getModels(signal?)` / `getWorkflowInterface(workflowId, signal?)` / `triggerWorkflow(workflowId, inputs?, signal?)`

### Batch Operations
- `createManualReviewBatch(payload, signal?)` → batch creation for review queue

## Key Components

### AgentPanel
Top-level right sidebar. Fetches credits on mount, manages thread list visibility, model selection. Renders `AgentThreadList` + `AgentChatContainer`.

### AgentChatContainer
Dual-mode routing (streaming vs non-streaming based on `isStreaming` prop). Features:
- Assets panel (collapsible sidebar extracting images/videos/audio from messages)
- Input request overlay modal
- Run workspace activity feed
- Auto-recovery (fetches active runs on mount)
- Auto-scroll with scroll-to-bottom button

### AgentChatMessage
Renders in order: reasoning (collapsible) → tool calls → content (SafeMarkdown) → generated text card → UI action cards → metadata footer (timestamp, model, cost)

**27 UI action card types:** `content_preview_card`, `oauth_connect_card`, `payment_cta_card`, `image_transform_card`, `campaign_create_card`, `campaign_control_card`, `analytics_snapshot_card`, `review_gate_card`, `generation_action_card`, `ingredient_picker_card`, `workflow_trigger_card`, `clip_workflow_run_card`, `clip_run_card`, `ingredient_alternatives_card`, `schedule_post_card`, `engagement_opportunity_card`, `onboarding_checklist_card`, `credits_balance_card`, `studio_handoff_card`, `brand_create_card`, `workflow_execute_card`, `trending_topics_card`, `content_calendar_card`, `batch_generation_card`, `voice_clone_card`, `ai_text_action_card`, `task_created_card`

### AgentToolCallDisplay
Collapsible card: status icon (checkmark/X/spinner) + tool label from `TOOL_LABELS` + status text + credits/duration + expandable details (arguments, errors).

### AgentStreamingMessage
Real-time streaming content with animated cursor and reasoning display.

### AgentRunWorkspace
Activity feed: timestamped work events with status colors (emerald=completed, red=failed, amber=pending). Active tool calls in expandable sections.

### AgentInputRequestOverlay
Dark backdrop modal: numbered option buttons + optional free-text textarea + recommended option marker + submit handler.

### Other Hooks
- `useAgentPageContext` — page context injection for agent
- `useCredentialMentions` — @-mention autocomplete for credentials
- `useIsMac` — platform detection for keyboard shortcuts
- `useMicrophoneInput` — voice input for agent chat

## Data Models

**File:** `packages/agent/src/models/`

```typescript
// AgentChatMessage
{ id, threadId, role: 'user'|'assistant'|'system', content, metadata?, createdAt }

// AgentThread
{ id, title?, systemPrompt?, platform?, brandId?, source?, status, lastMessage?, messageCount?, createdAt, updatedAt }

// AgentToolCall
{ id, name, arguments, result?, status: 'pending'|'running'|'completed'|'failed', error? }

// AgentWorkEvent
{ id, threadId, runId?, event: AgentWorkEventType, status: AgentWorkEventStatus, label, detail?, toolCallId?, toolName?, inputRequestId?, createdAt, startedAt? }
// AgentWorkEventType: STARTED | TOOL_STARTED | TOOL_COMPLETED | INPUT_REQUESTED | INPUT_SUBMITTED | COMPLETED | FAILED | CANCELLED
// AgentWorkEventStatus: PENDING | RUNNING | COMPLETED | FAILED | CANCELLED

// AgentInputRequest
{ threadId, inputRequestId, title, prompt, options?, recommendedOptionId?, allowFreeText?, runId? }
```

## Constants

**Panel dimensions:**
```typescript
AGENT_PANEL_MIN_WIDTH = 280
AGENT_PANEL_MAX_WIDTH = 500
AGENT_PANEL_DEFAULT_WIDTH = 380
AGENT_PANEL_ICON_STRIP_WIDTH = 48
AGENT_SIDEBAR_TRANSITION_DURATION_MS = 260
AGENT_SIDEBAR_TRANSITION_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)'
AGENT_SIDEBAR_SLIDE_OFFSET_PX = 8
```

**Agent models:** 8 models with cost tiers (0-15 credits/turn) — Auto (default), DeepSeek (1), Grok 4 (1), o4-mini (3, reasoning), GPT-4o (8), Claude Sonnet 4.5 (10), o3 (15, reasoning), Claude Opus 4.6 (15)

**Tool labels:** 44 human-readable labels for tool names

## WebSocket Manager

**File:** `packages/hooks/utils/use-socket-manager/use-socket-manager.ts`

Singleton `SocketManager` per auth token (Clerk `getToken()`).

**Hook returns:**
```typescript
{
  cleanup: () => void
  connect: () => void
  getListenersCount: () => number
  getSocketManager: () => SocketManager | null
  isConnected: () => boolean
  isReady: boolean
  subscribe: <T>(event, handler) => () => void  // returns unsubscriber
  subscribeMultiple: <T>(subscriptions) => (() => void)[]
  unsubscribe: <T>(event, handler?) => void
}
```

## Utilities

- `extractThreadAssets(messages)` — deduplicates media from UI actions → `ThreadAsset[]`
- `mapToolCallResponse(summary)` — API format → store format
- `resolveRetryPrompt(messages, messageId)` — finds preceding user message for retry
- `filterActionsByRole(actions, role)` — role-based action visibility
- `applyDashboardOperation(operation, blocks, blockIds)` — updates dashboard state from agent
