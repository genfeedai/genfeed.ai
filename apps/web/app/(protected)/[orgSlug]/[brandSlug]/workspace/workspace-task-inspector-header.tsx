'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Badge } from '@ui/primitives/badge';
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
import { useIsHrefAvailable } from '@/components/shell/use-available-rail-apps';
import type { WorkspaceTaskInspectorHeaderProps } from '@/features/workspace/props/workspace-task-inspector-header.props';
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
  const isHrefAvailable = useIsHrefAvailable();
  const writeHref = buildTaskLaunchHref(task, 'write');
  // Planning next steps opens the task in the Agent app.
  const isAgentAvailable = isHrefAvailable(writeHref);
  const generateHref = buildTaskLaunchHref(task, 'generate');
  const editorHref = buildTaskLaunchHref(task, 'editor');
  const automationHref = buildTaskLaunchHref(task, 'automation');
  return (
    <div className="px-4 pt-4">
      <div className="flex flex-col gap-4">
        <div className="flex min-w-0 flex-col space-y-3 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <Badge status={getTaskBadgeStatus(task)}>{statusLabel}</Badge>
            <Badge variant="secondary">{task.outputType}</Badge>
            {task.executionPathUsed ? (
              <Badge variant="secondary">
                {task.executionPathUsed.replaceAll('_', ' ')}
              </Badge>
            ) : null}
          </div>

          <h2 className="text-2xl tracking-[-0.02em] text-foreground">
            {task.title}
          </h2>
          <p className="text-sm leading-6 text-foreground/60">{task.request}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showReviewActions || isAgentAvailable ? (
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
          ) : null}
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
                  {isAgentAvailable ? (
                    <DropdownMenuItem
                      disabled={isBusy}
                      onSelect={() => void onPlanNextSteps(task)}
                    >
                      {translate('planNextSteps')}
                    </DropdownMenuItem>
                  ) : null}
                </>
              ) : null}
              <DropdownMenuItem
                disabled={isBusy}
                onSelect={() => void onDismiss(task.id)}
              >
                {translate('dismiss')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {isHrefAvailable(writeHref) ? (
                <DropdownMenuItem asChild>
                  <Link href={writeHref}>{translate('openInWrite')}</Link>
                </DropdownMenuItem>
              ) : null}
              {isHrefAvailable(generateHref) ? (
                <DropdownMenuItem asChild>
                  <Link href={generateHref}>{translate('openInGenerate')}</Link>
                </DropdownMenuItem>
              ) : null}
              {isHrefAvailable(editorHref) ? (
                <DropdownMenuItem asChild>
                  <Link href={editorHref}>{translate('openInEditor')}</Link>
                </DropdownMenuItem>
              ) : null}
              {isHrefAvailable(automationHref) ? (
                <DropdownMenuItem asChild>
                  <Link href={automationHref}>
                    {translate('openInAutomation')}
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {linkedIssueSummary.href ? (
                <DropdownMenuItem asChild>
                  <Link href={linkedIssueSummary.href}>
                    {translate('openIssue')}
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {isHrefAvailable(taskToolHref) ? (
                <DropdownMenuItem asChild>
                  <Link href={taskToolHref}>{taskToolLabel}</Link>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
