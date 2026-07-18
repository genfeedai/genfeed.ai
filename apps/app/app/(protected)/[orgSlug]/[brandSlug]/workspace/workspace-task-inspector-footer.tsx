'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { Task } from '@services/management/tasks.service';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { buildTaskLaunchHref } from '@/lib/navigation/operator-shell';
import type { WorkspaceTaskLinkedIssueSummary } from './workspace-task-inspector-helpers';

interface WorkspaceTaskInspectorFooterProps {
  isBusy: boolean;
  isStudioEnabled: boolean;
  linkedIssueSummary: WorkspaceTaskLinkedIssueSummary;
  onApprove: (taskId: string) => Promise<void>;
  onDismiss: (taskId: string) => Promise<void>;
  onPlanNextSteps: (task: Task) => Promise<void>;
  onRequestChanges: (taskId: string) => Promise<void>;
  showReviewActions: boolean;
  task: Task;
  taskToolHref: string;
  taskToolLabel: string;
}

export function WorkspaceTaskInspectorFooter({
  isBusy,
  isStudioEnabled,
  linkedIssueSummary,
  onApprove,
  onDismiss,
  onPlanNextSteps,
  onRequestChanges,
  showReviewActions,
  task,
  taskToolHref,
  taskToolLabel,
}: WorkspaceTaskInspectorFooterProps) {
  return (
    <div className="space-y-3 border-t border-white/[0.08] px-6 py-4">
      {showReviewActions ? (
        <div className="flex gap-2">
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
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
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
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant={ButtonVariant.GHOST} size={ButtonSize.SM}>
          <Link href={buildTaskLaunchHref(task, 'write')}>Open in Write</Link>
        </Button>
        <Button asChild variant={ButtonVariant.GHOST} size={ButtonSize.SM}>
          <Link
            href={buildTaskLaunchHref(task, 'generate', {
              studio: isStudioEnabled,
            })}
          >
            Open in Generate
          </Link>
        </Button>
        <Button asChild variant={ButtonVariant.GHOST} size={ButtonSize.SM}>
          <Link href={buildTaskLaunchHref(task, 'edit')}>Open in Edit</Link>
        </Button>
        <Button asChild variant={ButtonVariant.GHOST} size={ButtonSize.SM}>
          <Link href={buildTaskLaunchHref(task, 'automate')}>
            Open in Automate
          </Link>
        </Button>
        {linkedIssueSummary.href ? (
          <Button asChild variant={ButtonVariant.GHOST} size={ButtonSize.SM}>
            <Link href={linkedIssueSummary.href}>Open Issue</Link>
          </Button>
        ) : null}
        <Button asChild variant={ButtonVariant.GHOST} size={ButtonSize.SM}>
          <Link href={taskToolHref}>{taskToolLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
