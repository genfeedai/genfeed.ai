import type {
  WorkspaceTaskLinkedExecutionSummary,
  WorkspaceTaskLinkedIssueSummary,
  WorkspaceTaskLinkedOutputSummary,
  WorkspaceTaskOutputGroup,
} from '@props/workspace/workspace-task-inspector.props';
import type { Task } from '@services/management/tasks.service';

export interface WorkspaceTaskInspectorBodyProps {
  isBusy: boolean;
  linkedIssueSummary: WorkspaceTaskLinkedIssueSummary;
  linkedOutputGroups: WorkspaceTaskOutputGroup[];
  linkedOutputSummary: WorkspaceTaskLinkedOutputSummary;
  linkedExecutionSummary: WorkspaceTaskLinkedExecutionSummary & {
    isLoading: boolean;
  };
  onKeepOutput: (taskId: string, outputId: string) => Promise<void>;
  onTrashOutput: (taskId: string, outputId: string) => Promise<void>;
  onUnkeepOutput: (taskId: string, outputId: string) => Promise<void>;
  task: Task;
}
