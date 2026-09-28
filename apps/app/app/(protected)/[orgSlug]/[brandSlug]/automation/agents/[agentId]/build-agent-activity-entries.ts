import type {
  IAgentStrategyRunHistoryItem,
  IPost,
  IWorkflowExecution,
} from '@genfeedai/contracts/interfaces';
import { isPostAwaitingReview } from '@helpers/content/post-review.helper';
import type { AgentStrategyReport } from '@services/automation/agent-strategies.service';
import type { AgentActivityEntry } from './agent-activity-timeline.helper';
import { getExecutionModelLabel } from './execution-model-label.helper';

export type ActivityTranslate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

/** One entry per post this agent generated — the Content filter's rows. */
export function buildContentActivityEntries(
  posts: IPost[],
  translate: ActivityTranslate,
  getPostHref: (postId: string) => string,
): AgentActivityEntry[] {
  return posts.map((post) => {
    const isPending = isPostAwaitingReview(post);

    return {
      description: translate(isPending ? 'postMetaPending' : 'postMeta', {
        platform: post.platform || translate('platformNotSet'),
        state: post.targetExecutionState || post.status,
      }),
      href: getPostHref(post.id),
      id: `content-${post.id}`,
      timestamp: post.createdAt,
      title: post.label || post.description || translate('untitledPost'),
      type: 'content',
    };
  });
}

/** One entry per daily/weekly report — the Reports filter's rows. */
export function buildReportActivityEntries(
  reports: AgentStrategyReport[],
  translate: ActivityTranslate,
): AgentActivityEntry[] {
  return reports.map((report) => ({
    description:
      report.summary ||
      translate('counts', {
        credits: report.creditsSpent,
        generated: report.generatedCount,
        published: report.publishedCount,
      }),
    id: `report-${report.id}`,
    timestamp: report.periodEnd,
    title: translate(
      report.reportType === 'daily'
        ? 'activityDailyReport'
        : 'activityWeeklyReport',
    ),
    type: 'report',
  }));
}

function getRunStatusLabel(
  status: IAgentStrategyRunHistoryItem['status'],
  translate: ActivityTranslate,
): string {
  switch (status) {
    case 'failed':
      return translate('activityRunFailed');
    case 'budget_exhausted':
      return translate('activityRunBudgetExhausted');
    default:
      return translate('activityRunCompleted');
  }
}

/**
 * One entry per agent run and per workflow execution — the Runs filter's
 * rows. The two sources are not deduplicated: a run's `executionId` does not
 * reliably resolve to a fetched execution, and showing both is safer than
 * silently dropping one.
 */
export function buildRunActivityEntries(
  runHistory: IAgentStrategyRunHistoryItem[],
  executions: IWorkflowExecution[],
  translate: ActivityTranslate,
  getThreadHref: (threadId: string) => string,
  getExecutionHref: (executionId: string) => string,
): AgentActivityEntry[] {
  const runEntries: AgentActivityEntry[] = runHistory.map((run, index) => ({
    description: translate('activityRunGenerated', {
      count: run.contentGenerated,
      credits: run.creditsUsed,
    }),
    href: run.executionId
      ? getExecutionHref(run.executionId)
      : run.threadId
        ? getThreadHref(run.threadId)
        : undefined,
    id: `run-${run.startedAt}-${index}`,
    timestamp: run.startedAt,
    title: getRunStatusLabel(run.status, translate),
    type: 'run',
  }));

  const executionEntries: AgentActivityEntry[] = executions.map(
    (execution) => ({
      description: getExecutionModelLabel(execution),
      href: getExecutionHref(execution.id),
      id: `execution-${execution.id}`,
      timestamp: execution.startedAt ?? execution.createdAt,
      title: translate('activityExecution', { status: execution.status }),
      type: 'run',
    }),
  );

  return [...runEntries, ...executionEntries];
}
