import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { WorkspaceTaskInspectorFooterProps } from '@props/workspace/workspace-task-inspector-footer.props';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { buildTaskLaunchHref } from '@/lib/navigation/operator-shell';

export function WorkspaceTaskInspectorFooter({
  isBusy,
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
    <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
      <Button
        size={ButtonSize.SM}
        variant={ButtonVariant.DEFAULT}
        disabled={isBusy}
        onClick={() =>
          void (showReviewActions ? onApprove(task.id) : onPlanNextSteps(task))
        }
      >
        {showReviewActions ? 'Approve' : 'Plan Next Steps'}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            disabled={isBusy}
            withWrapper={false}
          >
            More actions
            <ChevronDown aria-hidden="true" className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {showReviewActions ? (
            <>
              <DropdownMenuItem
                disabled={isBusy}
                onSelect={() => void onRequestChanges(task.id)}
              >
                Request Changes
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isBusy}
                onSelect={() => void onPlanNextSteps(task)}
              >
                Plan Next Steps
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuItem
            disabled={isBusy}
            onSelect={() => void onDismiss(task.id)}
          >
            Dismiss
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={buildTaskLaunchHref(task, 'write')}>Open in Write</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={buildTaskLaunchHref(task, 'generate')}>
              Open in Generate
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={buildTaskLaunchHref(task, 'edit')}>Open in Edit</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={buildTaskLaunchHref(task, 'automation')}>
              Open in Automation
            </Link>
          </DropdownMenuItem>
          {linkedIssueSummary.href ? (
            <DropdownMenuItem asChild>
              <Link href={linkedIssueSummary.href}>Open Issue</Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <Link href={taskToolHref}>{taskToolLabel}</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
