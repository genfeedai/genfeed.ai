'use client';

import { ComponentSize } from '@genfeedai/contracts';
import type { WorkspaceTaskInspectorHeaderProps } from '@props/workspace/workspace-task-inspector-header.props';
import Badge from '@ui/display/badge/Badge';
import {
  getTaskBadgeStatus,
  useTaskStatusLabel,
} from './workspace-task.helpers';

export function WorkspaceTaskInspectorHeader({
  task,
}: WorkspaceTaskInspectorHeaderProps) {
  const statusLabel = useTaskStatusLabel(task);
  return (
    <div className="border-b border-border px-6 py-5">
      <div className="flex flex-col space-y-3 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <Badge status={getTaskBadgeStatus(task)} size={ComponentSize.SM}>
            {statusLabel}
          </Badge>
          <Badge variant="secondary" size={ComponentSize.SM}>
            {task.outputType}
          </Badge>
          {task.executionPathUsed ? (
            <Badge variant="secondary" size={ComponentSize.SM}>
              {task.executionPathUsed.replaceAll('_', ' ')}
            </Badge>
          ) : null}
        </div>

        <h2 className="text-2xl tracking-[-0.03em] text-foreground">
          {task.title}
        </h2>
        <p className="text-sm leading-6 text-foreground/55">{task.request}</p>
      </div>
    </div>
  );
}
