import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import type { WorkflowExecutionStats } from '@genfeedai/contracts/types';
import type { TrendItem } from '@genfeedai/props/trends/trends-page.props';
import type { Task } from '@services/management/tasks.service';

export interface ReviewInboxSummary {
  approvedCount: number;
  changesRequestedCount: number;
  pendingCount: number;
  readyCount: number;
  recentItems: unknown[];
  rejectedCount: number;
}

export interface DashboardProps {
  activeExecutions: IWorkflowExecution[];
  executions: IWorkflowExecution[];
  isExecutionsLoading?: boolean;
  isTasksLoading?: boolean;
  isTrendsLoading?: boolean;
  reviewInbox: ReviewInboxSummary;
  stats: WorkflowExecutionStats;
  trendsHref?: string;
  trendItems?: TrendItem[];
  workspaceTasks: Task[];
}
