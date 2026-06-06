'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import type { Task, TaskStatus } from '@services/management/tasks.service';
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
    <Link
      href={`/tasks/${issue.identifier}`}
      className="flex items-center gap-3 border-b border-white/5 px-4 py-2 transition-colors hover:bg-white/[0.02]"
    >
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
  );
}
