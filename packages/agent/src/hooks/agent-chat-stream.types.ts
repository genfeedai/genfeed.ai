import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { AgentArtifactReference } from '@genfeedai/interfaces';
import type { ChatAttachment } from '@genfeedai/props/ui/attachments.props';

export interface UseAgentChatStreamOptions {
  apiService: AgentApiService;
  model?: string;
  onOnboardingCompleted?: () => void | Promise<void>;
}

export interface SendStreamMessageOptions {
  artifactReferences?: AgentArtifactReference[];
  forceNewThread?: boolean;
  source?: 'agent' | 'proactive' | 'onboarding';
  signal?: AbortSignal;
  attachments?: ChatAttachment[];
  brandId?: string;
  planModeEnabled?: boolean;
}

export interface UseAgentChatStreamReturn {
  sendMessage: (
    content: string,
    options?: SendStreamMessageOptions,
  ) => Promise<void>;
  clearChat: () => void;
  isStreaming: boolean;
}

export interface BufferedThreadEvent {
  threadId?: string;
  data: unknown;
  handler: (data: unknown) => void;
}

export interface PendingStreamCompletion {
  initiatedAt: number;
  preAssistantIds: Set<string>;
  runId: string | null;
  startedAt: string | null;
  threadId: string;
}

export const STREAM_COMPLETION_POLL_INTERVAL_MS = 10_000;
export const STREAM_COMPLETION_GRACE_PERIOD_MS = 90_000;
