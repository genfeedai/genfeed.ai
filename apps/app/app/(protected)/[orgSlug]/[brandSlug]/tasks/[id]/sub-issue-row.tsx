'use client';

import { ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Task, TaskStatus } from '@services/management/tasks.service';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';

type SubIssueRowProps = {
  issue: Task;
  statusLabels: Record<TaskStatus, string>;
};

export function SubIssueRow({ issue, statusLabels }: SubIssueRowProps) {
  return (
    <Button
      asChild
      className="flex items-center gap-3 border-b border-border px-4 py-2 transition-colors hover:bg-muted/40"
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
    >
      <Link href={`${APP_ROUTES.WORKSPACE.TASKS}/${issue.identifier}`}>
        <span className="text-xs font-mono text-gray-800">
          {issue.identifier}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
          {issue.title}
        </span>
        <Badge status={issue.status} size={ComponentSize.SM}>
          {statusLabels[issue.status]}
        </Badge>
      </Link>
    </Button>
  );
}
