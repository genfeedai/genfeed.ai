import type { Task } from '@genfeedai/services/management/tasks.service';

export interface UsePlanningConversationParams {
  onError: (message: string) => void;
  onTaskUpdated: (task: Task) => void;
  setBusyTaskId: (taskId: string | null) => void;
}
