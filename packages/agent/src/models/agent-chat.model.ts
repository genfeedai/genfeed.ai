import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
import type { ClipRunCardState } from '@genfeedai/agent/models/clip-run-card.model';
import type { AgentThreadStatus } from '@genfeedai/enums';
import type {
  AgentDashboardOperation,
  AgentUIBlock,
} from '@genfeedai/interfaces';
import type { ChatAttachment } from '@props/ui/attachments.props';
import type { StructuredProgressDebugPayload } from '@utils/progress/structured-progress-event.util';

export interface AgentChatMessageMetadata {
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
  attachments?: ChatAttachment[];
  suggestedActions?: SuggestedAction[];
  proposedPlan?: AgentProposedPlan | null;
}

export interface AgentInputOption {
  description?: string;
  id: string;
  label: string;
}

export interface AgentInputRequest {
  allowFreeText?: boolean;
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

export interface AgentUiActionCta {
  label: string;
  href?: string;
  action?: string;
  payload?: Record<string, unknown>;
}

export interface AgentIngredientItem {
  id: string;
  url: string;
  thumbnailUrl?: string;
  type: 'image' | 'video';
  title?: string;
}

export interface AgentUiActionOutputVariant {
  id: string;
  kind: 'audio' | 'image' | 'text' | 'video';
  textContent?: string;
  thumbnailUrl?: string;
  title?: string;
  url?: string;
}

export interface AgentUiAction {
  id: string;
  type:
    | 'oauth_connect_card'
    | 'content_preview_card'
    | 'completion_summary_card'
    | 'payment_cta_card'
    | 'image_transform_card'
    | 'campaign_create_card'
    | 'campaign_control_card'
    | 'analytics_snapshot_card'
    | 'publish_post_card'
    | 'review_gate_card'
    | 'generation_action_card'
    | 'ingredient_picker_card'
    | 'workflow_trigger_card'
    | 'clip_workflow_run_card'
    | 'clip_run_card'
    | 'ingredient_alternatives_card'
    | 'schedule_post_card'
    | 'engagement_opportunity_card'
    | 'onboarding_checklist_card'
    | 'credits_balance_card'
    | 'studio_handoff_card'
    | 'brand_create_card'
    | 'workflow_execute_card'
    | 'trending_topics_card'
    | 'content_calendar_card'
    | 'batch_generation_card'
    | 'batch_generation_result_card'
    | 'voice_clone_card'
    | 'brand_voice_profile_card'
    | 'ai_text_action_card'
    | 'ads_search_results_card'
    | 'ad_detail_summary_card'
    | 'campaign_launch_prep_card'
    | 'workflow_created_card'
    | 'bot_created_card'
    | 'livestream_bot_status_card';
  title: string;
  description?: string;
  platform?: string;
  tweets?: string[];
  images?: string[];
  videos?: string[];
  audio?: string[];
  packs?: Array<{ label: string; price: string; credits: number }>;
  metrics?: Record<string, unknown>;
  status?: string;
  items?: Array<{
    id: string;
    title: string;
    type?: string;
    platform?: string;
    previewUrl?: string;
  }>;
  riskLevel?: 'low' | 'medium' | 'high';
  requiresConfirmation?: boolean;
  ctas?: AgentUiActionCta[];
  primaryCta?: AgentUiActionCta;
  secondaryCtas?: AgentUiActionCta[];
  utilityCtas?: AgentUiActionCta[];
  data?: Record<string, unknown>;
  summaryText?: string;
  outcomeBullets?: string[];
  outputVariants?: AgentUiActionOutputVariant[];
  generationType?: 'image' | 'video';
  generationParams?: {
    prompt?: string;
    model?: string;
    aspectRatio?: string;
    duration?: number;
  };
  ingredients?: AgentIngredientItem[];
  workflows?: {
    id: string;
    name: string;
    description?: string;
    status?: string;
  }[];
  clipRun?: {
    autonomousMode?: boolean;
    durationSeconds?: number;
    format?: 'landscape' | 'portrait' | 'square';
    inputValues?: Record<string, unknown>;
    mergeGeneratedVideos?: boolean;
    model?: string;
    prompt?: string;
    requireStepConfirmation?: boolean;
  };
  alternatives?: {
    label: string;
    prompt: string;
    generationType: 'image' | 'video';
  }[];
  scheduledAt?: string;
  platforms?: string[];
  contentId?: string;
  creditEstimate?: number;
  originalPost?: {
    author: string;
    content: string;
    platform?: string;
    url?: string;
  };
  draftReply?: string;
  checklist?: {
    id: string;
    label: string;
    isCompleted: boolean;
    description?: string;
    isClaimed?: boolean;
    isRecommended?: boolean;
    rewardCredits?: number;
    ctaLabel?: string;
    ctaHref?: string;
  }[];
  completionPercent?: number;
  earnedCredits?: number;
  totalJourneyCredits?: number;
  signupGiftCredits?: number;
  journeyEarnedCredits?: number;
  journeyRemainingCredits?: number;
  totalOnboardingCreditsVisible?: number;
  balance?: number;
  usagePercent?: number;
  usageLabel?: string;
  thumbnailUrl?: string;
  editorType?: string;
  studioUrl?: string;
  brandName?: string;
  brandDescription?: string;
  workflowId?: string;
  workflowName?: string;
  workflowDescription?: string;
  scheduleSummary?: string;
  nextRunAt?: string;
  botId?: string;
  botName?: string;
  sessionStatus?: string;
  trends?: {
    id: string;
    label: string;
    score?: number;
    platform?: string;
  }[];
  calendarDays?: {
    date: string;
    postCount: number;
  }[];
  batchCount?: number;
  completedCount?: number;
  failedCount?: number;
  creditsUsed?: number;
  audioUrl?: string;
  cloneProgress?: number;
  brandId?: string;
  recommendedVoiceId?: string;
  canUpload?: boolean;
  canUseExisting?: boolean;
  existingVoices?: Array<{
    id: string;
    label: string;
    provider?: string;
    cloneStatus?: string;
  }>;
  textContent?: string;
  textActions?: string[];
  clipRunState?: ClipRunCardState;
}

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
  createdAt: string;
}

export interface AgentThread {
  id: string;
  isPinned?: boolean;
  planModeEnabled?: boolean;
  title?: string;
  systemPrompt?: string;
  platform?: string;
  brandId?: string;
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
  pendingInputCount?: number;
  lastActivityAt?: string;
  lastAssistantPreview?: string;
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
}

export interface AgentPageContext {
  url?: string;
  postContent?: string;
  postAuthor?: string;
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
  threadId?: string;
  content: string;
  model?: string;
  source?: 'agent' | 'proactive' | 'onboarding';
  attachments?: ChatAttachment[];
  planModeEnabled?: boolean;
  brandIds?: string[];
  teamMemberIds?: string[];
  credentialIds?: string[];
  contentIds?: string[];
}

export interface AgentChatResponse {
  threadId: string;
  message: {
    role: string;
    content: string;
    metadata: Record<string, unknown>;
  };
  toolCalls: AgentToolCallSummary[];
  creditsUsed: number;
  creditsRemaining: number;
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

export interface AgentCreditsInfo {
  balance: number;
  modelCosts: Record<string, number>;
}

export interface AgentRunSummary {
  completedAt?: string;
  thread?: string;
  createdAt?: string;
  durationMs?: number;
  error?: string;
  id: string;
  label: string;
  metadata?: Record<string, unknown>;
  startedAt?: string;
  status: string;
}

export interface AgentChatStreamResponse {
  threadId: string;
  runId: string;
  startedAt: string;
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
  toolCalls: AgentToolCallSummary[];
  metadata: Record<string, unknown>;
  timestamp: string;
}

export interface AgentStreamErrorPayload {
  threadId: string;
  runId?: string;
  userId: string;
  error: string;
  timestamp: string;
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
