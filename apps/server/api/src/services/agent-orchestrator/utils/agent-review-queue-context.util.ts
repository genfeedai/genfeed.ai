import type {
  AgentReviewQueueSnapshot,
  AgentToolResult,
} from '@genfeedai/contracts/interfaces';

export function readReviewQueueSnapshot(
  toolName: string,
  result: Pick<AgentToolResult, 'success' | 'data'>,
): AgentReviewQueueSnapshot | undefined {
  if (!result.success || !result.data) {
    return undefined;
  }

  if (toolName === 'get_approval_summary') {
    const totalPending = result.data.totalPending;
    if (!isReviewCount(totalPending)) {
      return undefined;
    }
    return {
      approvedCount: 0,
      changesRequestedCount: 0,
      pendingCount: 0,
      readyCount: 0,
      unclassifiedCount: totalPending,
    };
  }

  if (toolName !== 'list_review_queue') {
    return undefined;
  }

  const { approvedCount, changesRequestedCount, pendingCount, readyCount } =
    result.data;
  if (
    !isReviewCount(approvedCount) ||
    !isReviewCount(changesRequestedCount) ||
    !isReviewCount(pendingCount) ||
    !isReviewCount(readyCount)
  ) {
    return undefined;
  }

  return {
    approvedCount,
    changesRequestedCount,
    pendingCount,
    readyCount,
    unclassifiedCount: 0,
  };
}

function isReviewCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
