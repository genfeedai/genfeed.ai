'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { Task } from '@services/management/tasks.service';
import { Button as BaseButton } from '@ui/primitives/button';
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
    <BaseButton
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      ariaLabel={`Open details for ${task.title}`}
      className="w-full border-b border-border p-4 text-left transition-colors duration-150 last:border-b-0 hover:bg-hover"
      data-testid="workspace-task-row"
      onClick={() => onOpen(task)}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
            getTaskStateDotClass(task),
          )}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              {task.title}
            </p>
            <span className="rounded-full border border-border px-2 py-1 text-2xs font-semibold uppercase tracking-[0.14em] text-foreground/65">
              {formatTaskStatus(task)}
            </span>
            {needsAttention ? (
              <span className="rounded-full bg-muted px-2 py-1 text-2xs font-semibold uppercase tracking-[0.14em] text-foreground/55">
                Needs attention
              </span>
            ) : null}
          </div>

          <p className="mt-1 line-clamp-2 text-sm text-foreground/55">
            {task.request}
          </p>

          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground/40">
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
          </div>
        </div>

        <ExternalLink className="mt-1 size-4 shrink-0 text-foreground/30" />
      </div>
    </BaseButton>
  );
}
