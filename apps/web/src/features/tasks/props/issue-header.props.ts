import type { TaskPriority, TaskStatus } from '@genfeedai/contracts/interfaces';
export type IssueHeaderProps = {
  identifier: string;
  status: TaskStatus;
  priority: TaskPriority;
  title: string;
  statusLabels: Record<TaskStatus, string>;
  priorityColors: Record<TaskPriority, string>;
  priorityLabels: Record<TaskPriority, string>;
};
