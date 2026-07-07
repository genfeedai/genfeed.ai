'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { Task, TaskStatus } from '@services/management/tasks.service';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';

type SubIssueRowProps = {
  issue: Task;
  statusColors: Record<TaskStatus, string>;
  statusLabels: Record<TaskStatus, string>;
};

export function SubIssueRow({
  issue,
  statusColors,
  statusLabels,
}: SubIssueRowProps) {
  return (
    <Button
      asChild
      className="flex items-center gap-3 border-b border-white/5 px-4 py-2 transition-colors hover:bg-muted/40"
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
    >
      <Link href={`/tasks/${issue.identifier}`}>
        <span className="text-xs font-mono text-white/40">
          {issue.identifier}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-white/80">
          {issue.title}
        </span>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            statusColors[issue.status],
          )}
        >
          {statusLabels[issue.status]}
        </span>
      </Link>
    </Button>
  );
}
