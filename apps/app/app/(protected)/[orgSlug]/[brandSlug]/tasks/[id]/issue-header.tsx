'use client';

import { ComponentSize } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import type {
  TaskPriority,
  TaskStatus,
} from '@services/management/tasks.service';
import Badge from '@ui/display/badge/Badge';

type IssueHeaderProps = {
  identifier: string;
  status: TaskStatus;
  priority: TaskPriority;
  title: string;
  statusLabels: Record<TaskStatus, string>;
  priorityColors: Record<TaskPriority, string>;
  priorityLabels: Record<TaskPriority, string>;
};

export default function IssueHeader({
  identifier,
  status,
  priority,
  title,
  statusLabels,
  priorityColors,
  priorityLabels,
}: IssueHeaderProps) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <span className="text-sm font-mono text-gray-800">{identifier}</span>
        <Badge status={status} size={ComponentSize.SM}>
          {statusLabels[status]}
        </Badge>
        <span
          className={cn(
            'text-2xs font-medium uppercase tracking-wider',
            priorityColors[priority],
          )}
        >
          {priorityLabels[priority]}
        </span>
      </div>
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
    </div>
  );
}
