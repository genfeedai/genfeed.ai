import type { ToolCallSummary } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { readReviewQueueSnapshot } from '@api/services/agent-orchestrator/utils/agent-review-queue-context.util';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { summarizeAgentToolResult } from '@genfeedai/utils/agent/summarize-agent-tool-result';

const RESULT_SUMMARY_MAX_LENGTH = 500;

export function buildToolResultSummary(
  toolName: string,
  result: Pick<AgentToolResult, 'success' | 'data' | 'error'>,
): Pick<ToolCallSummary, 'resultSummary' | 'reviewQueue'> {
  const reviewQueue = readReviewQueueSnapshot(toolName, result);
  const summary = result.success
    ? result.data
      ? summarizeAgentToolResult(result.data) || 'Done'
      : 'OK'
    : (result.error ?? 'Failed');
  return {
    resultSummary:
      result.success && summary.length > RESULT_SUMMARY_MAX_LENGTH
        ? `${summary.slice(0, RESULT_SUMMARY_MAX_LENGTH)}…`
        : summary,
    ...(reviewQueue ? { reviewQueue } : {}),
  };
}
