import type {
  ConversationComposerGenerationMode,
  ConversationComposerGenerationSettings,
} from '@genfeedai/agent/models/conversation-composer.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { AgentThreadMode } from '@genfeedai/contracts';
import type {
  AgentArtifactReference,
  KnowledgeSelection,
} from '@genfeedai/contracts/interfaces';
import type { ChatAttachment } from '@genfeedai/props/ui/attachments.props';
import type { MutableRefObject } from 'react';

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
  /** Reused only for recovery of an ambiguous acknowledgement. */
  clientRequestId?: string;
  generationMode?: ConversationComposerGenerationMode;
  generationSettings?: ConversationComposerGenerationSettings;
  knowledgeSelection?: KnowledgeSelection;
  /** Skills picked from the `/` palette for this turn. */
  requestedSkillSlugs?: string[];
  /** Only meaningful when this turn creates a new thread (#4672). */
  agentMode?: AgentThreadMode;
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
  runId?: string;
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

/** Mutable stream-ownership state shared by every mounted `useAgentChatStream`. */
export interface AgentStreamRuntime {
  /**
   * Run the stream belongs to. Events stamped with any other run id are
   * dropped, so a slow earlier run on the same thread cannot revive
   * Stop/WORKING or leak tokens into the current turn.
   */
  activeStreamRunIdRef: MutableRefObject<string | null>;
  activeStreamThreadRef: MutableRefObject<string | null>;
  bufferedEventsRef: MutableRefObject<BufferedThreadEvent[]>;
  completionTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  /** A send is waiting for its run id; events are held until it is known. */
  isAwaitingRunIdRef: MutableRefObject<boolean>;
  /** Live hook instances; shared subscriptions are torn down only at zero. */
  mountCount: number;
  pendingCompletionRef: MutableRefObject<PendingStreamCompletion | null>;
  unsubscribersRef: MutableRefObject<Array<() => void>>;
}

export const STREAM_COMPLETION_POLL_INTERVAL_MS = 10_000;
export const STREAM_COMPLETION_GRACE_PERIOD_MS = 90_000;
