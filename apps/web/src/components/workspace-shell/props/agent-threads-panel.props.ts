import type { AgentApiService, AgentThread } from '@genfeedai/agent';

/** The part of the agent API the Threads panel reads and writes. */
export type AgentThreadsPanelApi = Pick<
  AgentApiService,
  'chatStream' | 'getMessages'
>;

export interface AgentThreadsPanelProps {
  apiService: AgentThreadsPanelApi;
  isLoading?: boolean;
  /** The thread open in the light view. Leave out to let the panel keep it. */
  openThreadId?: string | null;
  onOpenThreadChange?: (threadId: string | null) => void;
  /** Opens a thread on its own full page. */
  onOpenFullThread?: (threadId: string) => void;
  threads: readonly AgentThread[];
}

export interface AgentThreadLightViewProps {
  apiService: AgentThreadsPanelApi;
  onBack: () => void;
  onOpenFullThread?: (threadId: string) => void;
  /** The thread was started by the master conversation. */
  isStartedByMaster?: boolean;
  thread: AgentThread;
}
