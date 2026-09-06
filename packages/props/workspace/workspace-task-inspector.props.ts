import type { Ingredient } from '@models/content/ingredient.model';
import type { Task } from '@services/management/tasks.service';

export interface WorkspaceTaskLinkedExecutionSummary {
  generatedContentCount: number;
  reportThreadCount: number;
  reportThreadId: string | null;
}

export interface WorkspaceTaskLinkedOutputSummary {
  error: string | null;
  isLoading: boolean;
  outputs: Ingredient[];
}

export interface WorkspaceTaskOutputGroup {
  children: Ingredient[];
  root: Ingredient;
}

export interface WorkspaceTaskLinkedIssueSummary {
  href: string | null;
  identifier: string | null;
  isLoading: boolean;
}

export interface WorkspaceTaskInspectorProps {
  busyTaskId: string | null;
  onApprove: (taskId: string) => Promise<void>;
  onDismiss: (taskId: string) => Promise<void>;
  onKeepOutput: (taskId: string, outputId: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onPlanNextSteps: (task: Task) => Promise<void>;
  onRequestChanges: (taskId: string) => Promise<void>;
  onTrashOutput: (taskId: string, outputId: string) => Promise<void>;
  onUnkeepOutput: (taskId: string, outputId: string) => Promise<void>;
  task: Task | null;
}
