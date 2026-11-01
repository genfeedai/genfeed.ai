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
}
