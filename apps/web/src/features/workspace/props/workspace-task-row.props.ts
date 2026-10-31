import type { Task } from '@services/management/tasks.service';

export type WorkspaceTaskRowProps = {
  onOpen: (task: Task) => void;
  task: Task;
};
