import { cn } from '@helpers/formatting/cn/cn.util';
import type { Task } from '@services/management/tasks.service';
import {
  formatTaskStatus,
  formatTaskTimestamp,
  getTaskStateDotClass,
} from './workspace-task.helpers';

export const workspaceInboxTableColumns = [
  {
    key: 'title',
    header: 'Task',
    render: (task: Task) => (
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            getTaskStateDotClass(task),
          )}
        />
        <span className="truncate font-medium text-foreground">
          {task.title}
        </span>
      </div>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    className: 'w-32',
    render: (task: Task) => (
      <span className="text-xs text-foreground/60">
        {formatTaskStatus(task)}
      </span>
    ),
  },
  {
    key: 'executionPathUsed',
    header: 'Path',
    className: 'w-36 hidden lg:table-cell',
    render: (task: Task) => (
      <span className="text-xs text-foreground/45">
        {task.executionPathUsed?.replaceAll('_', ' ') ?? ':'}
      </span>
    ),
  },
  {
    key: 'updatedAt',
    header: 'Updated',
    className: 'w-28 text-right',
    render: (task: Task) => (
      <span className="text-xs text-foreground/40">
        {formatTaskTimestamp(task)}
      </span>
    ),
  },
];
