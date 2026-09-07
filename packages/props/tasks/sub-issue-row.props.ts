import type { Task, TaskStatus } from '@services/management/tasks.service';

export type SubIssueRowProps = {
  issue: Task;
  statusLabels: Record<TaskStatus, string>;
};
