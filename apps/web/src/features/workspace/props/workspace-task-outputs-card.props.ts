import type { Task } from '@services/management/tasks.service';
import type {
  WorkspaceTaskLinkedOutputSummary,
  WorkspaceTaskOutputGroup,
} from '@/props/workspace/workspace-task-inspector.props';

export interface WorkspaceTaskOutputsCardProps {
  approvedOutputIds: string[];
  isBusy: boolean;
  linkedOutputGroups: WorkspaceTaskOutputGroup[];
  linkedOutputSummary: WorkspaceTaskLinkedOutputSummary;
  onKeepOutput: (taskId: string, outputId: string) => Promise<void>;
  onTrashOutput: (taskId: string, outputId: string) => Promise<void>;
  onUnkeepOutput: (taskId: string, outputId: string) => Promise<void>;
  taskId: string;
  outputType: Task['outputType'];
}
