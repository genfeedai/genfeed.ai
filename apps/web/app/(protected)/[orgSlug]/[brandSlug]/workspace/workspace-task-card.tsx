'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { WorkspaceTaskCardProps } from '@/features/workspace/props/workspace-task-card.props';

import {
  getAdvancedToolHref,
  getTaskBadgeStatus,
  useTaskStatusLabel,
  useTaskTimestamp,
} from './workspace-task.helpers';

export function WorkspaceTaskCard({
  busyTaskId,
  onApprove,
  onDismiss,
  onPlanNextSteps,
  onRequestChanges,
  task,
}: WorkspaceTaskCardProps) {
  const translate = useTranslations('pages.workspaceOverview.actions');
  const isBusy = busyTaskId === task.id;
  const showReviewActions = task.reviewState === 'pending_approval';
  const statusLabel = useTaskStatusLabel(task);
  const timestamp = useTaskTimestamp(task);

  return (
    <article className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{task.title}</p>
          <Badge status={getTaskBadgeStatus(task)}>{statusLabel}</Badge>
        </div>
        <p className="text-sm text-foreground/60">{task.request}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {task.routingSummary ? <span>{task.routingSummary}</span> : null}
          {task.progress?.message ? <span>{task.progress.message}</span> : null}
          <span>{timestamp}</span>
          {task.executionPathUsed ? (
            <span className="uppercase tracking-[0.14em]">
              {task.executionPathUsed.replaceAll('_', ' ')}
            </span>
          ) : null}
        </div>
        {task.resultPreview ? (
          <div className="border-l border-border pl-3 text-sm text-foreground/70">
            {task.resultPreview}
          </div>
        ) : null}
        {task.requestedChangesReason ? (
          <div className="border-l border-warning/40 pl-3 text-sm text-warning">
            {translate('requestedChangesReason', {
              reason: task.requestedChangesReason,
            })}
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
              {translate('approve')}
            </Button>
            <Button
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              disabled={isBusy}
              onClick={() => void onRequestChanges(task.id)}
            >
              {translate('requestChanges')}
            </Button>
          </>
        ) : null}
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          disabled={isBusy}
          onClick={() => void onDismiss(task.id)}
        >
          {translate('dismiss')}
        </Button>
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          disabled={isBusy}
          onClick={() => void onPlanNextSteps(task)}
        >
          {translate('planNextSteps')}
        </Button>
        <Button asChild variant={ButtonVariant.SECONDARY} size={ButtonSize.SM}>
          <Link href={getAdvancedToolHref(task)}>{translate('openTool')}</Link>
        </Button>
      </div>
    </article>
  );
}
