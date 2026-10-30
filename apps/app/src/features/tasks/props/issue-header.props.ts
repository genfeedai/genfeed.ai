import type {
  TaskPriority,
  TaskStatus,
} from '@services/management/tasks.service';

export type IssueHeaderProps = {
  identifier: string;
  status: TaskStatus;
  priority: TaskPriority;
  title: string;
  statusLabels: Record<TaskStatus, string>;
  priorityColors: Record<TaskPriority, string>;
  priorityLabels: Record<TaskPriority, string>;
};
