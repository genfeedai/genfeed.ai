import type { ActionOriginContext, AgentType } from '@genfeedai/enums';
import type { AgentArtifactReference } from '@genfeedai/interfaces';

export interface AgentChatTurnJobRequest {
  agentType?: AgentType;
  artifactReferences?: AgentArtifactReference[];
  attachments?: unknown;
  brandId?: string | null;
  clientRequestId: string;
  content: string;
  expectedContextVersion?: number;
  model?: string;
  pageContext?: unknown;
  planModeEnabled?: boolean;
  source?: 'agent' | 'proactive' | 'onboarding';
  threadId: string;
  /** Trusted internal provenance for a user-confirmed cross-thread handoff. */
  transferId?: string;
}

export interface AgentRunJobData {
  /** Distinguishes a durable user chat turn from proactive strategy work. */
  kind?: 'agent-chat-turn' | 'voice-generation';
  voiceRequest?: {
    ingredientId: string;
    text: string;
    voiceId: string;
  };
  /** Stable client identity used for ambiguous acknowledgement retries. */
  clientRequestId?: string;
  /** Encrypted bearer token for authenticated internal tool calls. */
  encryptedAuthToken?: string;
  /** Minimal API-key publishing scope; contains no credential material. */
  apiKeyContext?: { isApiKey?: boolean; scopes?: string[] };
  /** Authorized chat request executed after the HTTP acknowledgement. */
  request?: AgentChatTurnJobRequest;
  /** Trusted initiating action context propagated across queue retries */
  actionContext?: ActionOriginContext;
  /** The agent-runs record ID */
  runId: string;
  /** Organization context (required for multi-tenancy) */
  organizationId: string;
  /** User who triggered the run */
  userId: string;
  /** Strategy ID if cron-triggered */
  strategyId?: string;
  /** Agent type — drives tool subset and prompt template */
  agentType?: string;
  /** Preferred model override for this strategy */
  model?: string;
  /** Autonomy mode — supervised or auto-publish */
  autonomyMode?: string;
  /** Task/prompt for the agent */
  objective?: string;
  /** Credit budget cap */
  creditBudget?: number;
  /** Campaign ID — links the run to an agent campaign for coordination */
  campaignId?: string;
  /** Thread ID — runtime-visible conversation the run belongs to */
  threadId?: string;
}
