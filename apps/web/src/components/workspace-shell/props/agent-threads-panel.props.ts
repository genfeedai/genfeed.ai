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
  /** Threads marked done that the list above may not carry. */
  resolvedThreads?: readonly AgentThread[];
  /** Threads with a resolve or reopen in flight. */
  pendingThreadIds?: ReadonlySet<string>;
  /** Marks a thread resolved. Leave out to hide the action. */
  onResolveThread?: (threadId: string) => void | Promise<void>;
  onReopenThread?: (threadId: string) => void | Promise<void>;
  threads: readonly AgentThread[];
}

export interface AgentThreadLightViewProps {
  apiService: AgentThreadsPanelApi;
  isPending?: boolean;
  /** Marked done: the thread cannot be steered until it is reopened. */
  isResolved?: boolean;
  onReopen?: () => void;
  onResolve?: () => void;
  onBack: () => void;
  onOpenFullThread?: (threadId: string) => void;
  thread: AgentThread;
}
