import type { AgentThreadKind } from '@genfeedai/contracts';

/** Optional narrowing for the thread list (#8526). */
export interface AgentThreadListFilters {
  /** Only threads of this kind (`master` or `thread`). */
  kind?: AgentThreadKind;
  /** Only the threads spawned from this parent thread. */
  parentThreadId?: string;
}
