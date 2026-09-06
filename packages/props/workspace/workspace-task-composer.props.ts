import type { Task } from '@services/management/tasks.service';

export type WorkspaceTaskMode = 'standard' | 'research' | 'trends';

export interface WorkspaceTaskComposerProps {
  onOpenChange: (open: boolean) => void;
  onTaskCreated: (task: Task) => void;
  open: boolean;
}
