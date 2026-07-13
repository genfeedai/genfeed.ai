import type { AgentType } from '@genfeedai/enums';
import type { ValidatedAgentScope } from '@genfeedai/interfaces';
import type { ResolvedRuntimeSkill } from '@genfeedai/interfaces/ai';

export interface AgentChatAttachment {
  ingredientId: string;
  url: string;
  kind?: string;
  name?: string;
}

export interface AgentPageContext {
  contentFormat?: string;
  draftBody?: string;
  draftInstructions?: string;
  draftSummary?: string;
  draftTitle?: string;
  draftType?: string;
  postAuthor?: string;
  postContent?: string;
  route?: string;
  selectedText?: string;
  url?: string;
}

export interface AgentChatRequest {
  agentType?: AgentType;
  attachments?: AgentChatAttachment[];
  brandId?: string | null;
  content: string;
  expectedContextVersion?: number;
  pageContext?: AgentPageContext;
  planModeEnabled?: boolean;
  threadId?: string;
  model?: string;
  source?: 'agent' | 'proactive' | 'onboarding';
  systemPromptOverride?: string;
}

export interface AgentChatContext {
  authToken?: string;
  /** Campaign ID — when set, enables campaign coordination features */
  campaignId?: string;
  generationPriority?: string;
  organizationId: string;
  /** Resolved runtime skills for tool set augmentation */
  resolvedSkills?: ResolvedRuntimeSkill[];
  scope?: ValidatedAgentScope;
  /** When set, tool call progress is tracked against this agent-runs record */
  runId?: string;
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
  brandId?: string;
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
