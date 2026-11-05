import type { TaskStatus } from '@genfeedai/contracts/interfaces';
import type { Task } from '@services/management/tasks.service';

export type SubIssueRowProps = {
  issue: Task;
  statusLabels: Record<TaskStatus, string>;
};
