import type { Ingredient } from '@models/content/ingredient.model';
import type { Task } from '@services/management/tasks.service';
import type { ReactNode } from 'react';

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

export interface WorkspaceTaskDetailProps {
  busyTaskId: string | null;
  leading?: ReactNode;
  onApprove: (taskId: string) => Promise<void>;
  onDismiss: (taskId: string) => Promise<void>;
  onKeepOutput: (taskId: string, outputId: string) => Promise<void>;
  onPlanNextSteps: (task: Task) => Promise<void>;
  onRequestChanges: (taskId: string) => Promise<void>;
  onTrashOutput: (taskId: string, outputId: string) => Promise<void>;
  onUnkeepOutput: (taskId: string, outputId: string) => Promise<void>;
  task: Task | null;
  trailing?: ReactNode;
}

export interface WorkspaceTaskRailAdapterProps
  extends WorkspaceTaskDetailProps {
  onClose: () => void;
}
