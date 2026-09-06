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
import { useTranslations } from 'next-intl';
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
  const translate = useTranslations('pages.workspaceOverview.actions');
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
        {showReviewActions ? translate('approve') : translate('planNextSteps')}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            disabled={isBusy}
            withWrapper={false}
          >
            {translate('moreActions')}
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
                {translate('requestChanges')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isBusy}
                onSelect={() => void onPlanNextSteps(task)}
              >
                {translate('planNextSteps')}
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuItem
            disabled={isBusy}
            onSelect={() => void onDismiss(task.id)}
          >
            {translate('dismiss')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={buildTaskLaunchHref(task, 'write')}>
              {translate('openInWrite')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={buildTaskLaunchHref(task, 'generate')}>
              {translate('openInGenerate')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={buildTaskLaunchHref(task, 'edit')}>
              {translate('openInEdit')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={buildTaskLaunchHref(task, 'automation')}>
              {translate('openInAutomation')}
            </Link>
          </DropdownMenuItem>
          {linkedIssueSummary.href ? (
            <DropdownMenuItem asChild>
              <Link href={linkedIssueSummary.href}>
                {translate('openIssue')}
              </Link>
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
