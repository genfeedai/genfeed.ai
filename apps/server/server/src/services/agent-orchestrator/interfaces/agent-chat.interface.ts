import type { AgentType, RouterPriority } from '@genfeedai/enums';
import type {
  AgentArtifactReference,
  AnalyticsQueryReference,
  ScopedResearchFindingReference,
  SocialInboxAgentContextRecord,
  SocialInboxReference,
  ValidatedAgentScope,
} from '@genfeedai/interfaces';
import type { ResolvedRuntimeSkill } from '@genfeedai/interfaces/ai';
import type { ApiKeyPublishingContext } from '@server/helpers/utils/auth/api-key-publishing-scope.util';

export interface AgentChatAttachment {
  ingredientId: string;
  url: string;
  kind?: string;
  name?: string;
}

export interface AgentPageContext {
  authorizedSocialContext?: SocialInboxAgentContextRecord[];
  analyticsQuery?: AnalyticsQueryReference;
  contentFormat?: string;
  draftBody?: string;
  draftInstructions?: string;
  draftSummary?: string;
  draftTitle?: string;
  draftType?: string;
  postAuthor?: string;
  postContent?: string;
  researchReferences?: ScopedResearchFindingReference[];
  route?: string;
  selectedText?: string;
  socialReferences?: SocialInboxReference[];
  url?: string;
}

export type AgentGenerationMode = 'auto' | 'image' | 'video';

export interface AgentGenerationSettings {
  aspectRatio: string;
  duration?: number;
  model?: string;
  outputs?: number;
  prioritize?: RouterPriority;
  resolution?: string;
}

export interface AgentChatRequest {
  agentType?: AgentType;
  artifactReferences?: AgentArtifactReference[];
  attachments?: AgentChatAttachment[];
  brandId?: string | null;
  clientRequestId?: string;
  content: string;
  expectedContextVersion?: number;
  generationMode?: AgentGenerationMode;
  generationSettings?: AgentGenerationSettings;
  pageContext?: AgentPageContext;
  planModeEnabled?: boolean;
  threadId?: string;
  /** Trusted internal provenance for a user-confirmed cross-thread handoff. */
  transferId?: string;
  model?: string;
  source?: 'agent' | 'proactive' | 'onboarding';
  systemPromptOverride?: string;
}

export interface AgentTurnAcknowledgement {
  brandId?: string;
  clientRequestId: string;
  contextId: string;
  contextVersion: number;
  queuedAt: string;
  executionId: string;
  status: 'queued';
  threadId: string;
}

export interface AgentChatContext {
  apiKeyContext?: ApiKeyPublishingContext;
  /** Queue-owned turns await execution so BullMQ retains the durable lease. */
  executionMode?: 'background';
  /** Campaign ID — when set, enables campaign coordination features */
  campaignId?: string;
  /**
   * Router request vocabulary (lowercase). The persisted setting is the Prisma
   * enum `GenerationPriority` (SCREAMING) — map it with `toRouterPriority`
   * before it reaches this context or `body.prioritize`.
   */
  generationPriority?: RouterPriority;
  /** Per-turn media routing selected by the operator. */
  generationMode?: AgentGenerationMode;
  /** Validated media settings selected in the conversation composer. */
  generationSettings?: AgentGenerationSettings;
  organizationId: string;
  /** Resolved runtime skills for tool set augmentation */
  resolvedSkills?: ResolvedRuntimeSkill[];
  scope?: ValidatedAgentScope;
  /** Workflow execution that owns the current turn. */
  executionId?: string;
  /** Strategy ID — enables content attribution on created posts/content */
  strategyId?: string;
  userId: string;
}

export interface ToolCallSummary {
  creditsUsed: number;
  durationMs: number;
  error?: string;
  parameters?: Record<string, unknown>;
  resultSummary?: string;
  status: 'completed' | 'failed';
  toolName: string;
}

export interface AgentChatResult {
  brandId?: string | null;
  contextVersion?: number;
  threadId: string;
  creditsRemaining: number;
  creditsUsed: number;
  message: {
    content: string;
    metadata: Record<string, unknown>;
    role: string;
  };
  toolCalls: ToolCallSummary[];
}

export interface AgentThreadUiActionRequest {
  action: string;
  brandId?: string | null;
  expectedContextVersion?: number;
  payload?: Record<string, unknown>;
  threadId: string;
}

export interface ThreadResolutionResult {
  isCreated: boolean;
  seedTitle: string;
  threadId: string;
}
