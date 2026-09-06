'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import type { WorkspaceTaskInspectorHeaderProps } from '@props/workspace/workspace-task-inspector-header.props';
import Badge from '@ui/display/badge/Badge';
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
import {
  getTaskBadgeStatus,
  useTaskStatusLabel,
} from './workspace-task.helpers';

export function WorkspaceTaskInspectorHeader({
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
}: WorkspaceTaskInspectorHeaderProps) {
  const statusLabel = useTaskStatusLabel(task);
  const translate = useTranslations('pages.workspaceOverview.actions');
  return (
    <div className="border-b border-border px-6 py-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col space-y-3 text-left">
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

        <div className="flex shrink-0 items-center gap-2">
          <Button
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            disabled={isBusy}
            onClick={() =>
              void (showReviewActions
                ? onApprove(task.id)
                : onPlanNextSteps(task))
            }
          >
            {showReviewActions
              ? translate('approve')
              : translate('planNextSteps')}
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
      </div>
    </div>
  );
}
