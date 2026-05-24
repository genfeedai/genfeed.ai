import type {
  TaskDocument,
  TaskEvent,
  TaskProgress,
} from '@api/collections/tasks/schemas/task.schema';

export type WorkspaceTaskEvent = TaskEvent;

export type WorkspaceTaskProgress = TaskProgress;

export interface WorkspaceTaskDocument extends TaskDocument {}
