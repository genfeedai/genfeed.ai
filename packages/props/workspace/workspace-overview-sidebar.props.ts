import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import type { ReviewInboxSummary } from '@props/workspace/workspace-task.props';
import type { Task, TasksService } from '@services/management/tasks.service';

export interface WorkspaceOverviewSidebarProps {
  busyTaskId: string | null;
  historyPreviewItems: Task[];
  activeExecutions: IWorkflowExecution[];
  initialReviewInbox: ReviewInboxSummary;
  inProgressTasks: Task[];
  isTasksLoading?: boolean;
  mutateTask: (
    taskId: string,
    operation: (service: TasksService) => Promise<Task>,
  ) => Promise<void>;
  openPlanningConversation: (task: Task) => Promise<void>;
  replaceTaskSearchParam: (taskId: string | null) => void;
  setSelectedTaskId: (taskId: string | null) => void;
}
