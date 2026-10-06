import type {
  AgentCompletionSuggestedAction,
  AgentCompletionToolCall,
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
    if (!isReviewCount(totalPending) || totalPending === 0) {
      return undefined;
    }
    return {
      approvedCount: 0,
      changesRequestedCount: 0,
      pendingCount: totalPending,
      readyCount: 0,
      scope: 'summary',
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
    scope: typeof result.data.batchId === 'string' ? 'batch' : 'inbox',
  };
}

function isReviewCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function buildReviewSuggestedActions(
  toolCalls: AgentCompletionToolCall[],
): AgentCompletionSuggestedAction[] {
  const latestReviewTool = [...toolCalls]
    .reverse()
    .find((toolCall) =>
      [
        'list_review_queue',
        'batch_approve_reject',
        'get_approval_summary',
      ].includes(toolCall.toolName),
    );
  if (latestReviewTool?.status !== 'completed') return [];
  if (latestReviewTool.toolName === 'batch_approve_reject') {
    return [
      {
        id: 'review-refresh',
        label: 'Check remaining reviews',
        prompt: "Show me what's still waiting for review after those changes",
      },
    ];
  }
  const queue = latestReviewTool.reviewQueue;
  if (!queue) return [];
  const suggestions: AgentCompletionSuggestedAction[] = [];
  if (queue.readyCount > 0) {
    suggestions.push({
      id: 'review-ready',
      label: 'Approve the ready ones',
      prompt: 'Show me the items that are safe to approve right now',
    });
  }
  if (queue.changesRequestedCount > 0) {
    suggestions.push({
      id: 'review-fix',
      label: 'Fix the weak spots',
      prompt:
        'Take the weakest review items and rewrite them so they are ready to publish',
    });
  }
  if (queue.approvedCount > 0) {
    suggestions.push({
      id: 'review-schedule',
      label: 'Queue approved content',
      prompt: 'Schedule the approved content into the best available slots',
    });
  }
  if (queue.pendingCount > 0) {
    suggestions.push({
      id: 'review-progress',
      label: 'Check generation progress',
      prompt:
        'Check the content that is still generating and tell me when it will be ready for review',
    });
  }
  if (suggestions.length > 0) return suggestions;
  if (queue.scope !== 'inbox') {
    return [
      {
        id: 'review-open',
        label: 'Check the full review queue',
        prompt:
          "Show me what's waiting for review across my full review queue without a batch or status filter",
      },
    ];
  }
  return [
    {
      id: 'review-create',
      label: 'Draft new content',
      prompt: 'Draft new content for my brand that I can review',
    },
    {
      id: 'review-ideas',
      label: 'Find content ideas',
      prompt: 'Suggest fresh content ideas for my brand',
    },
  ];
}
