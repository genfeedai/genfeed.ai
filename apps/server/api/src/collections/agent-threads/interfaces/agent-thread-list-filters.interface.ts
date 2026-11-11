import type { AgentThreadKind } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';

/** Optional narrowing for the thread list (#8526). */
export interface AgentThreadListFilters {
  /** Only threads of this kind (`master` or `thread`). */
  kind?: AgentThreadKind;
  /** Only the threads spawned from this parent thread. */
  parentThreadId?: string;
  /**
   * Whose threads the list covers (#9936), from
   * `AgentThreadAccessService.buildOwnerWhere`. When omitted the list is the
   * caller's own threads. It carries no tenant keys: the list adds them.
   */
  ownerWhere?: Prisma.AgentThreadWhereInput;
}
