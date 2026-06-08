'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import type {
  TaskPriority,
  TaskStatus,
} from '@services/management/tasks.service';

type IssueHeaderProps = {
  identifier: string;
  status: TaskStatus;
  priority: TaskPriority;
  title: string;
  statusColors: Record<TaskStatus, string>;
  statusLabels: Record<TaskStatus, string>;
  priorityColors: Record<TaskPriority, string>;
  priorityLabels: Record<TaskPriority, string>;
};

export default function IssueHeader({
  identifier,
  status,
  priority,
  title,
  statusColors,
  statusLabels,
  priorityColors,
  priorityLabels,
}: IssueHeaderProps) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <span className="text-sm font-mono text-white/40">{identifier}</span>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            statusColors[status],
          )}
        >
          {statusLabels[status]}
        </span>
        <span
          className={cn(
            'text-[10px] font-medium uppercase tracking-wider',
            priorityColors[priority],
          )}
        >
          {priorityLabels[priority]}
        </span>
      </div>
      <h1 className="text-xl font-semibold text-white">{title}</h1>
    </div>
  );
}
