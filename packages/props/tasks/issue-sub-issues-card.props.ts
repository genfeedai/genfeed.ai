import type { Task, TaskStatus } from '@services/management/tasks.service';

export type IssueSubIssuesCardProps = {
  subIssues: Task[];
  statusLabels: Record<TaskStatus, string>;
};
