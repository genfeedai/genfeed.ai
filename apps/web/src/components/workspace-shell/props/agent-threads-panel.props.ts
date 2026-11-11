import type { AgentApiService, AgentThread } from '@genfeedai/agent';

/** The part of the agent API the Threads panel reads and writes. */
export type AgentThreadsPanelApi = Pick<
  AgentApiService,
  | 'acceptAgentTransfer'
  | 'chatStream'
  | 'createAgentHandoff'
  | 'createThreadShare'
  | 'declineAgentTransfer'
  | 'deleteThreadShare'
  | 'getMessages'
  | 'getThreadShares'
  | 'respondToUiAction'
>;

/** The part of the agent API the hand-off dialog writes. */
export type AgentThreadHandoffApi = Pick<AgentApiService, 'createAgentHandoff'>;

/** An active organization member, as the share dialog and author labels need. */
export interface AgentThreadMember {
  avatarUrl: string | null;
  /** The brands the viewer can see this member on. */
  brandIds: string[];
  name: string;
  roleLabel: string | null;
  userId: string;
}

export interface AgentThreadsPanelProps {
  apiService: AgentThreadsPanelApi;
  /**
   * The workspace's current brand (the topbar's). The list shows only that
   * brand's threads and offers no filter of its own; leave out to list all.
   */
  brandId?: string | null;
  /**
   * Where a row links to. A plain click opens the thread in the panel; a
   * modified click (new tab) follows this link.
   */
  getThreadHref: (threadId: string) => string;
  isLoading?: boolean;
  /** The thread open in the light view. Leave out to let the panel keep it. */
  openThreadId?: string | null;
  onOpenThreadChange?: (threadId: string | null) => void;
  /** Opens a thread on its own full page. */
  onOpenFullThread?: (threadId: string) => void;
  /** Threads marked done that the list above may not carry. */
  resolvedThreads?: readonly AgentThread[];
  /** More resolved threads exist than `resolvedThreads` carries. */
  hasMoreResolved?: boolean;
  isLoadingMoreResolved?: boolean;
  /** Loads the next page of resolved threads. Leave out to hide the action. */
  onLoadMoreResolved?: () => void | Promise<void>;
  /** Threads with a resolve or reopen in flight. */
  pendingThreadIds?: ReadonlySet<string>;
  /** Marks a thread resolved. Leave out to hide the action. */
  onResolveThread?: (threadId: string) => void | Promise<void>;
  onReopenThread?: (threadId: string) => void | Promise<void>;
  threads: readonly AgentThread[];
}

export interface AgentThreadLightViewProps {
  apiService: AgentThreadsPanelApi;
  /** Organization members by user id: names the owner and each author. */
  membersById?: ReadonlyMap<string, AgentThreadMember>;
  members?: readonly AgentThreadMember[];
  isPending?: boolean;
  /** Marked done: the thread cannot be steered until it is reopened. */
  isResolved?: boolean;
  onReopen?: () => void;
  onResolve?: () => void;
  onBack: () => void;
  onOpenFullThread?: (threadId: string) => void;
  thread: AgentThread;
}
