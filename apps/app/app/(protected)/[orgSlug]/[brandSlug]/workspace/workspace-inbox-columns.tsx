import { ComponentSize } from '@genfeedai/contracts';
import type { Task } from '@services/management/tasks.service';
import Badge from '@ui/display/badge/Badge';
import {
  formatTaskStatus,
  formatTaskTimestamp,
} from './workspace-task.helpers';

export const workspaceInboxTableColumns = [
  {
    key: 'title',
    header: 'Task',
    render: (task: Task) => (
      <span className="block truncate font-medium text-foreground">
        {task.title}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    className: 'w-40',
    render: (task: Task) => (
      <Badge status={getTaskBadgeStatus(task)} size={ComponentSize.SM}>
        {formatTaskStatus(task)}
      </Badge>
    ),
  },
  {
    key: 'executionPathUsed',
    header: 'Path',
    className: 'w-36 hidden lg:table-cell',
    render: (task: Task) => (
      <span className="text-xs text-muted-foreground">
        {task.executionPathUsed?.replaceAll('_', ' ') ?? ''}
      </span>
    ),
  },
  {
    key: 'updatedAt',
    header: 'Updated',
    className: 'w-28 text-right',
    render: (task: Task) => (
      <span className="text-xs text-muted-foreground">
        {formatTaskTimestamp(task)}
      </span>
    ),
  },
];
