import type { Task, TasksService } from '@services/management/tasks.service';

export interface WorkspaceTaskQueueCardProps {
  busyTaskId: string | null;
  isLoading?: boolean;
  items: Task[];
  mutateTask: (
    taskId: string,
    operation: (service: TasksService) => Promise<Task>,
  ) => Promise<void>;
  openPlanningConversation: (task: Task) => Promise<void>;
}
