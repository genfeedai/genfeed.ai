import { ComponentSize } from '@genfeedai/contracts';
import type { WorkspaceTaskInspectorHeaderProps } from '@props/workspace/workspace-task-inspector-header.props';
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@ui/primitives/sheet';
import { formatTaskStatus, getTaskBadgeStatus } from './workspace-task.helpers';

export function WorkspaceTaskInspectorHeader({
  task,
}: WorkspaceTaskInspectorHeaderProps) {
  return (
    <div className="border-b border-border px-6 py-5 pr-14">
      <SheetHeader className="space-y-3 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <Badge status={getTaskBadgeStatus(task)} size={ComponentSize.SM}>
            {formatTaskStatus(task)}
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

        <SheetTitle className="text-2xl tracking-[-0.03em]">
          {task.title}
        </SheetTitle>
        <SheetDescription className="text-sm leading-6 text-foreground/55">
          {task.request}
        </SheetDescription>
      </SheetHeader>
    </div>
  );
}
