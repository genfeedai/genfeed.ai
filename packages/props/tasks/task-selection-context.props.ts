import type { Task } from '@services/management/tasks.service';

export interface TaskSelectionContextValue {
  /** Bumped whenever the inspector saves, so the list refetches. */
  readonly revision: number;
  readonly selectedTask: Task | null;
  readonly selectTask: (task: Task | null) => void;
  readonly commitTask: (task: Task) => void;
}
