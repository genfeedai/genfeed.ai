import type { AgentApiService, AgentThread } from '@genfeedai/agent';

/** The part of the agent API the Threads panel reads and writes. */
export type AgentThreadsPanelApi = Pick<
  AgentApiService,
  'chatStream' | 'getMessages'
>;

export interface AgentThreadsPanelProps {
  apiService: AgentThreadsPanelApi;
  isLoading?: boolean;
  /** Opens a thread on its own full page. */
  onOpenFullThread?: (threadId: string) => void;
  threads: readonly AgentThread[];
}

export interface AgentThreadLightViewProps {
  apiService: AgentThreadsPanelApi;
  onBack: () => void;
  onOpenFullThread?: (threadId: string) => void;
  thread: AgentThread;
}
