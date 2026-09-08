import type { Task } from '@services/management/tasks.service';

export type WorkspaceTaskMode = 'standard' | 'research' | 'trends';

export interface WorkspaceTaskComposerProps {
  onOpenChange: (open: boolean) => void;
  onTaskCreated: (task: Task) => void;
  open: boolean;
}

export interface FacecamOption {
  id: string;
  label: string;
  preview?: string;
  provider?: string;
}

export type UseWorkspaceTaskComposerParams = Pick<
  WorkspaceTaskComposerProps,
  'onOpenChange' | 'onTaskCreated'
>;

export interface WorkspaceBrandMentionMatch {
  id: string;
  label: string;
}
