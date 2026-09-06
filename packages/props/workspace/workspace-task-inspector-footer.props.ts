import type { WorkspaceTaskLinkedIssueSummary } from '@props/workspace/workspace-task-inspector.props';
import type { Task } from '@services/management/tasks.service';

export interface WorkspaceTaskInspectorFooterProps {
  isBusy: boolean;
  linkedIssueSummary: WorkspaceTaskLinkedIssueSummary;
  onApprove: (taskId: string) => Promise<void>;
  onDismiss: (taskId: string) => Promise<void>;
  onPlanNextSteps: (task: Task) => Promise<void>;
  onRequestChanges: (taskId: string) => Promise<void>;
  showReviewActions: boolean;
  task: Task;
  taskToolHref: string;
  taskToolLabel: string;
}
