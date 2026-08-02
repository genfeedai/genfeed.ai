'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { Task } from '@services/management/tasks.service';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import {
  formatTaskStatus,
  formatTaskTimestamp,
  getAdvancedToolHref,
} from './workspace-task.helpers';

type WorkspaceTaskCardProps = {
  busyTaskId: string | null;
  onApprove: (taskId: string) => Promise<void>;
  onDismiss: (taskId: string) => Promise<void>;
  onPlanNextSteps: (task: Task) => Promise<void>;
  onRequestChanges: (taskId: string) => Promise<void>;
  task: Task;
};

export function WorkspaceTaskCard({
  busyTaskId,
  onApprove,
  onDismiss,
  onPlanNextSteps,
  onRequestChanges,
  task,
}: WorkspaceTaskCardProps) {
  const isBusy = busyTaskId === task.id;
  const showReviewActions = task.reviewState === 'pending_approval';

  return (
    <article className="grid gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{task.title}</p>
          <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/65">
            {formatTaskStatus(task)}
          </span>
        </div>
        <p className="text-sm text-foreground/55">{task.request}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-foreground/45">
          {task.routingSummary ? <span>{task.routingSummary}</span> : null}
          {task.progress?.message ? <span>{task.progress.message}</span> : null}
          <span>{formatTaskTimestamp(task)}</span>
          {task.executionPathUsed ? (
            <span className="uppercase tracking-[0.14em]">
              {task.executionPathUsed.replaceAll('_', ' ')}
            </span>
          ) : null}
        </div>
        {task.resultPreview ? (
          <div className="border-l border-white/15 pl-3 text-sm text-foreground/70">
            {task.resultPreview}
          </div>
        ) : null}
        {task.requestedChangesReason ? (
          <div className="border-l border-amber-400/40 pl-3 text-sm text-amber-200">
            Requested changes: {task.requestedChangesReason}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 lg:justify-end">
        {showReviewActions ? (
          <>
            <Button
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
              disabled={isBusy}
              onClick={() => void onApprove(task.id)}
            >
              Approve
            </Button>
            <Button
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              disabled={isBusy}
              onClick={() => void onRequestChanges(task.id)}
            >
              Request Changes
            </Button>
          </>
        ) : null}
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          disabled={isBusy}
          onClick={() => void onDismiss(task.id)}
        >
          Dismiss
        </Button>
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          disabled={isBusy}
          onClick={() => void onPlanNextSteps(task)}
        >
          Plan Next Steps
        </Button>
        <Button
          asChild
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
          className="font-semibold"
        >
          <Link href={getAdvancedToolHref(task)}>Open Tool</Link>
        </Button>
      </div>
    </article>
  );
}
