'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import type { Task } from '@services/management/tasks.service';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { ExternalLink } from 'lucide-react';

import {
  formatTaskStatus,
  formatTaskTimestamp,
  getTaskStateDotClass,
  isUnreadInboxTask,
} from './workspace-task.helpers';

type WorkspaceTaskRowProps = {
  onOpen: (task: Task) => void;
  task: Task;
};

export function WorkspaceTaskRow({ onOpen, task }: WorkspaceTaskRowProps) {
  const needsAttention = isUnreadInboxTask(task);

  return (
    <ListRow
      ariaLabel={`Open details for ${task.title}`}
      data-testid="workspace-task-row"
      onClick={() => onOpen(task)}
      leading={
        <span
          aria-hidden="true"
          className={cn(
            'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
            getTaskStateDotClass(task),
          )}
        />
      }
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 truncate">{task.title}</span>
          <span className="rounded-full border border-border px-2 py-1 text-2xs font-semibold uppercase tracking-[0.14em] text-foreground/65">
            {formatTaskStatus(task)}
          </span>
          {needsAttention ? (
            <span className="rounded-full bg-muted px-2 py-1 text-2xs font-semibold uppercase tracking-[0.14em] text-foreground/55">
              Needs attention
            </span>
          ) : null}
        </span>
      }
      description={task.request}
      meta={
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          {task.routingSummary ? <span>{task.routingSummary}</span> : null}
          {task.progress?.stage ? (
            <span>
              {task.progress.stage} · {task.progress.percent ?? 0}%
            </span>
          ) : null}
          {task.executionPathUsed ? (
            <span>{task.executionPathUsed.replaceAll('_', ' ')}</span>
          ) : null}
          <span>{formatTaskTimestamp(task)}</span>
        </span>
      }
      trailing={
        <ExternalLink className="mt-1 size-4 shrink-0 text-foreground/30" />
      }
    />
  );
}
