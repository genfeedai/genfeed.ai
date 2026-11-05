import type {
  AgentApiService,
  AgentThread,
  AgentThreadResolution,
} from '@genfeedai/agent';

/** The part of the agent API the thread resolution hook reads and writes. */
export type ThreadResolutionApi = Pick<
  AgentApiService,
  'archiveThread' | 'getThreads' | 'unarchiveThread'
>;

export interface ThreadResolutionState extends AgentThreadResolution {
  /** Threads the operator marked done, newest first. Never the master. */
  resolvedThreads: readonly AgentThread[];
  pendingThreadIds: ReadonlySet<string>;
  /** More archived threads exist past the ones loaded so far. */
  hasMoreResolved: boolean;
  isLoadingMoreResolved: boolean;
  /** Loads the next page of archived threads. */
  loadMoreResolved: () => Promise<void>;
}
