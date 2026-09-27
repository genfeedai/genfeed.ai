import type { ContextSidebarSelectionOrigin } from '@props/ui/context-sidebar.props';
import type { Task } from '@services/management/tasks.service';

export interface TaskSelectionContextValue {
  /** Bumped whenever the inspector saves, so the list refetches. */
  readonly revision: number;
  readonly selectedTask: Task | null;
  /** `user` when a row was clicked; `automatic` when `?taskId=` restored it. */
  readonly selectionOrigin: ContextSidebarSelectionOrigin;
  readonly selectTask: (
    task: Task | null,
    origin?: ContextSidebarSelectionOrigin,
  ) => void;
  readonly commitTask: (task: Task) => void;
}
