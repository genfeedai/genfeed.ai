import type { TaskPriority, TaskStatus } from '@genfeedai/contracts/interfaces';
import type {
  Task,
  TaskLinkedEntityModel,
} from '@services/management/tasks.service';

export type IssueSidebarProps = {
  issue: Task;
  statusLabels: Record<TaskStatus, string>;
  statusTransitions: Record<TaskStatus, TaskStatus[]>;
  priorityColors: Record<TaskPriority, string>;
  priorityLabels: Record<TaskPriority, string>;
  entityModelColors: Record<TaskLinkedEntityModel, string>;
  entityModelLabels: Record<TaskLinkedEntityModel, string>;
  onStatusUpdate: (newStatus: TaskStatus) => Promise<void>;
};
