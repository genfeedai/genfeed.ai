import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
import type {
  AgentThreadKind,
  AgentThreadMode,
  AgentThreadStatus,
  RouterPriority,
} from '@genfeedai/contracts';
import type {
  AgentArtifactReference,
  AgentDashboardOperation,
  AgentKnowledgeCitations,
  AgentScopeMetadata,
  AgentThreadUiActionRun,
  AgentTransferPresentation,
  AgentUIBlock,
  AgentUiAction,
  AnalyticsQueryReference,
  CreativeAppAgentContext,
  KnowledgeSelection,
  ScopedResearchFindingReference,
  SocialInboxReference,
} from '@genfeedai/contracts/interfaces';
import type { ChatAttachment } from '@genfeedai/props/ui/attachments.props';
import type { StructuredProgressDebugPayload } from '@genfeedai/utils/progress/structured-progress-event.util';

export interface AgentChatMessageMetadata {
  /** The thread scope the server wrote this reply under. */
  agentScope?: AgentScopeMetadata;
  /**
   * Set when the run that wrote this reply failed without throwing (a
   * structured failure): the reply is its result, and the run failed.
   */
  runOutcome?: { error: string; status: 'failed' };
  artifactReferences?: AgentArtifactReference[];
  generatedContent?: string;
  isFallbackContent?: boolean;
  model?: string;
  contentType?: string;
  platform?: string;
  mediaUrl?: string;
  wasInserted?: boolean;
  toolCalls?: AgentToolCall[];
  uiActions?: AgentUiAction[];
  uiBlocks?: AgentUIBlock[];
  dashboardOperation?: AgentDashboardOperation;
  riskLevel?: 'low' | 'medium' | 'high';
  reviewRequired?: boolean;
  reasoning?: string;
  memoryEntries?: AgentMemoryEntry[];
  /** Server-verified Knowledge sources behind the `[n]` markers in the answer. */
  knowledgeCitations?: AgentKnowledgeCitations;
  attachments?: ChatAttachment[];
  suggestedActions?: SuggestedAction[];
  proposedPlan?: AgentProposedPlan | null;
  /** Execution that produced this assistant reply. */
  runId?: string;
  agentTransfer?: {
    direction: 'inbound' | 'outbound';
    transfer?: AgentTransferPresentation;
    transferId: string;
  };
}

export interface AgentInputOption {
  description?: string;
  id: string;
  label: string;
}

export interface AgentInputRequest {
  allowFreeText?: boolean;
  isMultiSelect?: boolean;
  maxSelections?: number;
  fieldId?: string;
  threadId: string;
  inputRequestId: string;
  metadata?: Record<string, unknown>;
  options?: AgentInputOption[];
  prompt: string;
  recommendedOptionId?: string;
  runId?: string;
  title: string;
}

export enum AgentWorkEventType {
  STARTED = 'started',
  TOOL_STARTED = 'tool_started',
  TOOL_COMPLETED = 'tool_completed',
  INPUT_REQUESTED = 'input_requested',
  INPUT_SUBMITTED = 'input_submitted',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum AgentWorkEventStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface AgentWorkEvent {
  threadId: string;
  createdAt: string;
  debug?: StructuredProgressDebugPayload;
  detail?: string;
  estimatedDurationMs?: number;
  event: AgentWorkEventType;
  id: string;
  inputRequestId?: string;
  label: string;
  phase?: string;
  progress?: number;
  remainingDurationMs?: number;
  runId?: string;
  resultSummary?: string;
  startedAt?: string;
  status: AgentWorkEventStatus;
  toolCallId?: string;
  toolName?: string;
  parameters?: Record<string, unknown>;
}

export type {
  AgentIngredientItem,
  AgentNextStepOption,
  AgentPublishSettingField,
  AgentPublishTargetProposal,
  AgentPublishValidationIssue,
  AgentThreadUiActionRun,
  AgentThreadUiActionState,
  AgentUiAction,
  AgentUiActionCta,
  AgentUiActionHandler,
  AgentUiActionOf,
  AgentUiActionOutcome,
  AgentUiActionOutputVariant,
  AgentUiActionType,
} from '@genfeedai/contracts/interfaces';

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  debug?: StructuredProgressDebugPayload;
  detail?: string;
  estimatedDurationMs?: number;
  label?: string;
  phase?: string;
  progress?: number;
  remainingDurationMs?: number;
  result?: unknown;
  resultSummary?: string;
  parameters?: Record<string, unknown>;
  startedAt?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

export interface AgentChatMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: AgentChatMessageMetadata;
  toolCalls?: AgentToolCallSummary[];
  createdAt: string;
}

export interface AgentThread {
  id: string;
  contextVersion: number;
  organizationId?: string;
  isPinned?: boolean;
  /** `master` for the user's org-level orchestrating thread (#8526). */
  kind?: AgentThreadKind;
  mode?: AgentThreadMode;
  /** The thread that spawned this one, when it was spawned. */
  parentThreadId?: string | null;
  requestedModel?: string;
  runtimeKey?: string;
  title?: string;
  systemPrompt?: string;
  platform?: string;
  brandId?: string | null;
  brandLabel?: string | null;
  source?: string;
  status: AgentThreadStatus;
  lastMessage?: string;
  messageCount?: number;
  runStatus?:
    | 'idle'
    | 'queued'
    | 'running'
    | 'waiting_input'
    | 'completed'
    | 'failed'
    | 'cancelled';
  runtimeState?:
    | 'ready'
    | 'running'
    | 'awaiting_input'
    | 'awaiting_confirmation'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'interrupted'
    | 'restoring';
  decisionHref?: string | null;
  pendingInputCount?: number;
  /** The thread event sequence the run summary was read at (#5636). */
  statusSequence?: number;
  lastActivityAt?: string;
  lastAssistantPreview?: string;
  lastGeneratedAssetUrl?: string | null;
  attentionState?: 'running' | 'needs-input' | 'updated' | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentThreadSnapshotTimelineEntry {
  id: string;
  kind:
    | 'assistant'
    | 'input'
    | 'message'
    | 'plan'
    | 'tool'
    | 'work'
    | 'system'
    | 'error';
  label: string;
  detail?: string;
  status?: string;
  runId?: string | null;
  toolName?: string;
  requestId?: string;
  role?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
  sequence: number;
}

export interface AgentProposedPlan {
  id: string;
  explanation?: string;
  createdAt: string;
  updatedAt: string;
  content?: string;
  steps?: Record<string, unknown>[];
  status?: 'draft' | 'awaiting_approval' | 'approved' | 'superseded';
  awaitingApproval?: boolean;
  lastReviewAction?: 'approve' | 'request_changes';
  revisionNote?: string;
  approvedAt?: string;
}

export interface AgentThreadSnapshot {
  activeRun: {
    runId?: string;
    model?: string;
    status?: string;
    startedAt?: string;
    completedAt?: string;
    error?: string;
  } | null;
  lastAssistantMessage: {
    messageId: string;
    content: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
  } | null;
  lastSequence: number;
  latestProposedPlan: AgentProposedPlan | null;
  latestUiBlocks: {
    operation: string;
    blocks?: Record<string, unknown>[];
    blockIds?: string[];
    updatedAt?: string;
  } | null;
  memorySummaryRefs: string[];
  pendingApprovals: Record<string, unknown>[];
  pendingInputRequests: Array<{
    requestId: string;
    title: string;
    prompt: string;
    allowFreeText?: boolean;
    isMultiSelect?: boolean;
    maxSelections?: number;
    recommendedOptionId?: string;
    options: AgentInputOption[];
    fieldId?: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
  }>;
  profileSnapshot: Record<string, unknown> | null;
  sessionBinding: {
    activeCommandId?: string;
    lastSeenAt?: string;
    metadata?: Record<string, unknown>;
    model?: string;
    resumeCursor?: string;
    runId?: string;
    status?: string;
  } | null;
  source: string | null;
  threadId: string;
  threadStatus: string | null;
  timeline: AgentThreadSnapshotTimelineEntry[];
  title: string | null;
  /** Ui-action runs on the thread, by run id, as the projection records them. */
  uiActionRuns?: AgentThreadUiActionRun[];
}

export interface AgentPageContext {
  analyticsQuery?: AnalyticsQueryReference;
  contentFormat?: string;
  /** Which creative app the page is, whether a project is open, and the projects. */
  creativeApp?: CreativeAppAgentContext;
  draftBody?: string;
  draftInstructions?: string;
  draftSummary?: string;
  draftTitle?: string;
  draftType?: string;
  postContent?: string;
  postAuthor?: string;
  route?: string;
  researchReferences?: ScopedResearchFindingReference[];
  selectedText?: string;
  socialReferences?: SocialInboxReference[];
  /** Viewer's IANA timezone, so the agent can resolve "today" and slot times. */
  timezone?: string;
  url?: string;
}

export interface SendMessagePayload {
  threadId: string;
  content: string;
  platform?: string | null;
  brandId?: string | null;
  pageContext?: AgentPageContext;
}

export interface CreateThreadPayload {
  platform?: string | null;
  brandId?: string | null;
  title?: string;
}

export interface AgentToolCallSummary {
  toolName: string;
  status: 'completed' | 'failed';
  creditsUsed: number;
  durationMs: number;
  debug?: StructuredProgressDebugPayload;
  error?: string;
  parameters?: Record<string, unknown>;
  resultSummary?: string;
}

export interface AgentChatPayload {
  artifactReferences?: AgentArtifactReference[];
  threadId?: string;
  brandId?: string | null;
  clientRequestId?: string;
  expectedContextVersion?: number;
  generationMode?: 'auto' | 'image' | 'video';
  generationSettings?: {
    aspectRatio: string;
    duration?: number;
    model?: string;
    outputs?: number;
    prioritize?: RouterPriority;
    resolution?: string;
  };
  knowledgeSelection?: KnowledgeSelection;
  content: string;
  model?: string;
  source?: 'agent' | 'proactive';
  attachments?: ChatAttachment[];
  pageContext?: AgentPageContext;
  /** Skills picked from the composer `/` palette for this turn. */
  requestedSkillSlugs?: string[];
  /** Only meaningful when this turn creates a new thread (#4672). */
  agentMode?: AgentThreadMode;
  brandIds?: string[];
  teamMemberIds?: string[];
  credentialIds?: string[];
  contentIds?: string[];
}

export interface AgentChatResponse {
  threadId: string;
  brandId?: string | null;
  contextVersion: number;
  message: {
    role: string;
    content: string;
    metadata: Record<string, unknown>;
  };
  toolCalls: AgentToolCallSummary[];
  creditsUsed: number;
  creditsRemaining: number;
}

/**
 * The real shape of `POST /agent/threads/:threadId/ui-actions`
 * (`AgentOrchestratorService.handleThreadUiAction` on the server) — it only
 * enqueues the `agent.thread.ui-action` workflow and acks, the same async
 * contract as a turn (`AgentChatStreamResponse`). There is no synchronous
 * `message`/`toolCalls`/credits on this response; the resulting assistant
 * message arrives through the thread's normal message stream, and callers
 * must reconcile it the same way a turn does (poll `getMessages`).
 */
export interface AgentUiActionAckResponse {
  executionId: string;
  status: 'queued';
  threadId: string;
}

/** The ui-action a settled run executed, as the server names it. */
export interface AgentStreamUiActionRef {
  action: string;
  sourceId: string;
}

export interface AgentMemoryEntry {
  id: string;
  campaignId?: string;
  kind?: string;
  scope?: string;
  content: string;
  summary?: string;
  contentType?: string;
  platform?: string;
  sourceType?: string;
  sourceUrl?: string;
  sourceContentId?: string;
  sourceMessageId?: string;
  tags?: string[];
  importance?: number;
  confidence?: number;
  createdAt?: string;
}

export interface AgentChatStreamResponse {
  threadId: string;
  brandId?: string | null;
  clientRequestId: string;
  contextId: string;
  contextVersion: number;
  queuedAt: string;
  executionId: string;
  status: 'queued';
}

export interface UpdateAgentThreadContextPayload {
  brandId?: string | null;
  expectedContextVersion: number;
}

export interface AgentStreamTokenPayload {
  threadId: string;
  runId?: string;
  userId: string;
  token: string;
  timestamp: string;
}

export interface AgentStreamReasoningPayload {
  threadId: string;
  runId?: string;
  userId: string;
  content: string;
  timestamp: string;
}

export interface AgentStreamToolStartPayload {
  threadId: string;
  runId?: string;
  userId: string;
  detail?: string;
  label?: string;
  phase?: string;
  progress?: number;
  startedAt?: string;
  toolName: string;
  toolCallId: string;
  parameters: Record<string, unknown>;
  timestamp: string;
}

export interface AgentStreamToolCompletePayload {
  threadId: string;
  runId?: string;
  userId: string;
  debug?: StructuredProgressDebugPayload;
  detail?: string;
  estimatedDurationMs?: number;
  label?: string;
  phase?: string;
  progress?: number;
  remainingDurationMs?: number;
  resultSummary?: string;
  toolName: string;
  toolCallId: string;
  status: 'completed' | 'failed';
  creditsUsed: number;
  durationMs: number;
  error?: string;
  timestamp: string;
  uiActions?: AgentUiAction[];
}

export interface AgentStreamDonePayload {
  threadId: string;
  durationMs?: number;
  userId: string;
  fullContent: string;
  creditsUsed: number;
  creditsRemaining: number;
  runId?: string;
  startedAt?: string;
  /** Set when this run generated and persisted the thread's title. */
  threadTitle?: string;
  toolCalls: AgentToolCallSummary[];
  metadata: Record<string, unknown>;
  timestamp: string;
  /** The thread's event sequence once this run's events were recorded. */
  sequence?: number;
  /** A ui-action run's thread scope after it ran (a brand confirmation moves it). */
  brandId?: string | null;
  contextVersion?: number;
  uiAction?: AgentStreamUiActionRef;
  /**
   * `failed` when the run recorded a failure but still produced this reply (a
   * structured failure, not a throw); `error` is the recorded failure.
   */
  runStatus?: 'completed' | 'failed';
  error?: string;
}

export interface AgentStreamErrorPayload {
  threadId: string;
  runId?: string;
  userId: string;
  error: string;
  timestamp: string;
  sequence?: number;
  uiAction?: AgentStreamUiActionRef;
}

export interface AgentStreamStartPayload {
  threadId: string;
  runId?: string;
  startedAt?: string;
  userId: string;
  model: string;
  timestamp: string;
}

export interface AgentStreamUIBlocksPayload {
  threadId: string;
  runId?: string;
  userId: string;
  operation: AgentDashboardOperation;
  blocks?: AgentUIBlock[];
  blockIds?: string[];
  timestamp: string;
}

export interface AgentWorkEventPayload {
  threadId: string;
  debug?: StructuredProgressDebugPayload;
  detail?: string;
  estimatedDurationMs?: number;
  event: AgentWorkEvent['event'];
  inputRequestId?: string;
  label: string;
  phase?: string;
  progress?: number;
  remainingDurationMs?: number;
  runId?: string;
  resultSummary?: string;
  startedAt?: string;
  status: AgentWorkEvent['status'];
  timestamp: string;
  toolCallId?: string;
  toolName?: string;
  userId: string;
  parameters?: Record<string, unknown>;
}

export interface AgentInputRequestPayload extends AgentInputRequest {
  timestamp: string;
  userId: string;
}

export interface AgentInputResolvedPayload {
  answer: string;
  threadId: string;
  inputRequestId: string;
  runId?: string;
  timestamp: string;
  userId: string;
}

/** Receipt of a queued turn; execution ownership still comes from the ACK. */
export interface AgentTurnAcceptedPayload {
  organizationId: string;
  userId: string;
  threadId: string;
  runId: string;
  clientRequestId: string;
  acceptedAt: string;
}
