import { createPublishingApprovalsRoute } from '@genfeedai/contracts/constants';
import type {
  AgentToolResult,
  AgentUiAction,
} from '@genfeedai/contracts/interfaces';

export interface ApprovedMutationOutcome {
  content: string;
  nextActions: AgentUiAction[];
}

function readPlatforms(args: Record<string, unknown>): string[] {
  return Array.isArray(args.platforms)
    ? args.platforms.filter(
        (platform): platform is string => typeof platform === 'string',
      )
    : [];
}

/**
 * What the thread says once an approved mutation has run. Most tools finish
 * inside the approval, but `generate_turbo_content` only queues a run: the
 * drafts arrive later, so the reply points at the run's live card and the
 * approval queue instead of claiming the work is done.
 */
export function buildApprovedMutationOutcome(
  toolName: string,
  args: Record<string, unknown>,
  result: AgentToolResult,
): ApprovedMutationOutcome | null {
  if (toolName !== 'generate_turbo_content' || !result.success) {
    return null;
  }
  const turboRunId = result.data?.turboRunId;
  if (typeof turboRunId !== 'string' || !turboRunId) {
    return null;
  }

  const totalCount =
    typeof result.data?.totalCount === 'number'
      ? result.data.totalCount
      : typeof args.count === 'number'
        ? args.count
        : undefined;
  const brandId = typeof args.brandId === 'string' ? args.brandId : undefined;
  const approvalQueueHref = createPublishingApprovalsRoute({ run: turboRunId });

  return {
    content: `Generating ${
      totalCount === undefined
        ? 'your posts'
        : `${totalCount} post${totalCount === 1 ? '' : 's'}`
    } now. Progress and each draft appear below as they finish, and every draft lands in the publishing approval queue for review.`,
    nextActions: [
      {
        brandId,
        completedCount: 0,
        creditsUsed: result.creditsUsed,
        ctas: [{ href: approvalQueueHref, label: 'Open approval queue' }],
        data: { turboRunId },
        id: `turbo-run-result:${turboRunId}`,
        platforms: readPlatforms(args),
        status: 'queued',
        title: 'Generating posts',
        turboRunCount: totalCount,
        type: 'turbo_run_result_card',
      },
    ],
  };
}
