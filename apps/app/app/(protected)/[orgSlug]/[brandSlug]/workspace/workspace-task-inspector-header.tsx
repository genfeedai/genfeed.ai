'use client';

import type { Task } from '@services/management/tasks.service';
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@ui/primitives/sheet';
import { formatTaskStatus } from './workspace-task.helpers';

interface WorkspaceTaskInspectorHeaderProps {
  task: Task;
}

export function WorkspaceTaskInspectorHeader({
  task,
}: WorkspaceTaskInspectorHeaderProps) {
  return (
    <div className="border-b border-white/[0.08] px-6 py-5 pr-14">
      <SheetHeader className="space-y-3 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/65">
            {formatTaskStatus(task)}
          </span>
          <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
            {task.outputType}
          </span>
          {task.executionPathUsed ? (
            <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
              {task.executionPathUsed.replaceAll('_', ' ')}
            </span>
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
