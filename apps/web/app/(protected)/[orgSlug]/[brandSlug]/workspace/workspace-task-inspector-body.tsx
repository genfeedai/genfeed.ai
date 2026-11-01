import {
  ButtonSize,
  ButtonVariant,
  CardGap,
  CardTone,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { PanelTabs } from '@ui/primitives/tabs';
import { AlertTriangle, Clock } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import type { WorkspaceTaskInspectorBodyProps } from '@/features/workspace/props/workspace-task-inspector-body.props';
import type { WorkspaceTranslate } from '@/props/workspace/workspace-task.props';
import { useWorkspaceTaskHref } from './use-workspace-task-href';
import {
  getTaskContinuityQa,
  useTaskTimestamp,
} from './workspace-task.helpers';
import { WorkspaceTaskOutputsCard } from './workspace-task-outputs-card';
import { WorkspaceTaskThreadCard } from './workspace-task-thread-card';

type WorkspaceTaskInspectorTabId = 'details' | 'activity' | 'records';

export function WorkspaceTaskInspectorBody({
  isBusy,
  linkedIssueSummary,
  linkedOutputGroups,
  linkedOutputSummary,
  linkedExecutionSummary,
  onKeepOutput,
  onTrashOutput,
  onUnkeepOutput,
  task,
}: WorkspaceTaskInspectorBodyProps) {
  const taskHref = useWorkspaceTaskHref();
  const translate = useTranslations('pages.workspaceOverview');
  const translateTabs = useTranslations('pages.tasks.inspector.tabs');
  const [activeTab, setActiveTab] =
    useState<WorkspaceTaskInspectorTabId>('details');
  const continuityQa = getTaskContinuityQa(task);
  const taskTimestamp = useTaskTimestamp(task);

  const hasResultPreview = Boolean(task.resultPreview);
  const hasContinuityQa = Boolean(continuityQa);
  const hasThread = (task.eventStream?.length ?? 0) > 0;
  const hasOutputs = (task.linkedOutputIds?.length ?? 0) > 0;
  const hasReportLocation = Boolean(linkedExecutionSummary.reportThreadId);
  const hasFailure = Boolean(task.failureReason);
  const hasRequestedChanges = Boolean(task.requestedChangesReason);
  const hasActivity =
    hasResultPreview ||
    hasContinuityQa ||
    hasThread ||
    hasOutputs ||
    hasReportLocation ||
    hasFailure ||
    hasRequestedChanges;

  const detailsContent = (
    <div className="space-y-4 p-6">
      <Card label={translate('inspector.routing')} gap={CardGap.SM}>
        <p className="text-sm text-foreground">
          {task.routingSummary ?? translate('inspector.autoRouted')}
        </p>
      </Card>
      <Card label={translate('inspector.progress')} gap={CardGap.SM}>
        <div className="space-y-1 text-sm text-foreground/60">
          <p>{task.progress?.stage ?? translate('inspector.queued')}</p>
          <p>
            {translate('inspector.percentComplete', {
              percent: task.progress?.percent ?? 0,
            })}
          </p>
          <p>
            {translate('inspector.activeRuns', {
              count: task.progress?.activeRunCount ?? 0,
            })}
          </p>
          {task.progress?.message ? <p>{task.progress.message}</p> : null}
          <p className="flex items-center gap-2">
            <Clock className="size-4" />
            {translate('inspector.updated')} {taskTimestamp}
          </p>
          {task.createdAt ? (
            <p>
              {translate('inspector.created')}{' '}
              <ClientFormattedDate value={task.createdAt} />
            </p>
          ) : null}
          {task.completedAt ? (
            <p>
              {translate('inspector.completed')}{' '}
              <ClientFormattedDate value={task.completedAt} />
            </p>
          ) : null}
        </div>
      </Card>
      <Card label={translate('inspector.labels.taskMetadata')}>
        <div className="flex flex-col gap-2 text-sm text-foreground/70">
          <p>{translate('inspector.priority', { value: task.priority })}</p>
          <p>
            {translate('inspector.reviewState', {
              value:
                task.reviewState?.replaceAll('_', ' ') ??
                translate('inspector.reviewStateNone'),
            })}
          </p>
          <p>
            {translate('inspector.organization', {
              value: task.organizationId,
            })}
          </p>
          {task.brandId ? (
            <p>{translate('inspector.brand', { value: task.brandId })}</p>
          ) : null}
        </div>
      </Card>
    </div>
  );

  const activityContent = (
    <div className="space-y-4 p-6">
      {hasResultPreview ? (
        <Card
          label={translate('inspector.labels.resultPreview')}
          tone={CardTone.SUCCESS}
        >
          <div className="text-sm text-foreground/80">{task.resultPreview}</div>
        </Card>
      ) : null}

      {continuityQa ? (
        <Card
          label={translate('inspector.labels.visualContinuityQa')}
          tone={CardTone.WARNING}
        >
          <div className="flex flex-col gap-3 text-sm text-foreground/80">
            <p className="flex items-center gap-2 font-semibold">
              {continuityQa.summary.driftClipCount > 0 ? (
                <AlertTriangle className="size-4 text-warning" />
              ) : null}
              {continuityQa.status.replace('_', ' ')} ·{' '}
              {translate('inspector.driftFindings', {
                count: continuityQa.summary.driftClipCount,
              })}
            </p>
            {continuityQa.skipReason ? (
              <p className="text-foreground/60">
                {translate('inspector.assessmentSkipped', {
                  reason: continuityQa.skipReason.replaceAll('_', ' '),
                })}
              </p>
            ) : null}
            {continuityQa.clips.map((clip) => (
              <div
                key={clip.clipId}
                className="space-y-1 rounded-md border border-border/70 p-3"
              >
                <p className="font-semibold">
                  {translate('inspector.clipNumber', {
                    number: clip.clipIndex + 1,
                  })}
                </p>
                <p>
                  {translate('inspector.characterConfidence', {
                    confidence: formatConfidence(
                      clip.character.confidence,
                      translate,
                    ),
                    verdict: clip.character.verdict,
                  })}
                </p>
                <p>
                  {translate('inspector.outfitConfidence', {
                    confidence: formatConfidence(
                      clip.outfit.confidence,
                      translate,
                    ),
                    verdict: clip.outfit.verdict,
                  })}
                </p>
                <p>
                  {translate('inspector.productConfidence', {
                    confidence: formatConfidence(
                      clip.product.confidence,
                      translate,
                    ),
                    verdict: clip.product.verdict,
                  })}
                </p>
                {clip.errors.map((error) => (
                  <p
                    key={`${clip.clipId}-${error.code}`}
                    className="text-warning"
                  >
                    {error.message}
                  </p>
                ))}
                {clip.evidenceFrames.map((frame, index) => (
                  <Link
                    key={frame.url}
                    href={frame.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mr-3 inline-block underline underline-offset-2"
                  >
                    {translate('inspector.evidenceFrame', {
                      number: index + 1,
                    })}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {hasThread ? (
        <WorkspaceTaskThreadCard eventStream={task.eventStream ?? []} />
      ) : null}

      {hasOutputs ? (
        <WorkspaceTaskOutputsCard
          approvedOutputIds={task.approvedOutputIds ?? []}
          isBusy={isBusy}
          linkedOutputGroups={linkedOutputGroups}
          linkedOutputSummary={linkedOutputSummary}
          onKeepOutput={onKeepOutput}
          onTrashOutput={onTrashOutput}
          onUnkeepOutput={onUnkeepOutput}
          taskId={task.id}
          outputType={task.outputType}
        />
      ) : null}

      {hasReportLocation ? (
        <Card label={translate('inspector.labels.reportLocation')}>
          <div className="flex flex-col gap-3 text-sm text-foreground/80">
            <p>{translate('inspector.reportLocationDescription')}</p>
            <Button
              asChild
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              className="font-semibold"
            >
              <Link
                href={taskHref(
                  task,
                  `${APP_ROUTES.AGENT.ROOT}/${linkedExecutionSummary.reportThreadId}`,
                )}
              >
                {translate('inspector.openReportThread')}
              </Link>
            </Button>
          </div>
        </Card>
      ) : null}

      {hasFailure ? (
        <Card
          label={translate('inspector.labels.failure')}
          tone={CardTone.DESTRUCTIVE}
        >
          <div className="text-sm text-destructive">{task.failureReason}</div>
        </Card>
      ) : null}

      {hasRequestedChanges ? (
        <Card
          label={translate('inspector.labels.requestedChanges')}
          tone={CardTone.WARNING}
        >
          <div className="text-sm text-warning">
            {task.requestedChangesReason}
          </div>
        </Card>
      ) : null}
    </div>
  );

  const recordsContent = (
    <div className="space-y-4 p-6">
      <Card label={translate('inspector.labels.linkedRecords')}>
        <div className="flex flex-col gap-2 text-sm text-foreground/70">
          <p>
            {translate('inspector.runs', {
              count: task.linkedExecutionIds?.length ?? 0,
            })}
          </p>
          {task.linkedIssueId ? (
            <p>
              {translate('inspector.issue', {
                value: linkedIssueSummary.isLoading
                  ? translate('inspector.loading')
                  : (linkedIssueSummary.identifier ??
                    translate('inspector.unavailable')),
              })}
            </p>
          ) : null}
          <p>
            {translate('inspector.outputs', {
              count: task.linkedOutputIds?.length ?? 0,
            })}
          </p>
          <p>
            {translate('inspector.reportThreads', {
              count: linkedExecutionSummary.isLoading
                ? translate('inspector.loading')
                : linkedExecutionSummary.reportThreadCount,
            })}
          </p>
          <p>
            {translate('inspector.generatedContent', {
              count: linkedExecutionSummary.isLoading
                ? translate('inspector.loading')
                : linkedExecutionSummary.generatedContentCount,
            })}
          </p>
          <p>
            {translate('inspector.approvals', {
              count: task.linkedApprovalIds?.length ?? 0,
            })}
          </p>
          {task.planningThreadId ? (
            <p className="truncate">
              {translate('inspector.thread', {
                value: task.planningThreadId,
              })}
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="workspace-task-inspector-body"
    >
      <PanelTabs
        activeTab={activeTab}
        ariaLabel={translateTabs('details')}
        className="flex-1"
        testId="workspace-task-inspector-tabs"
        onTabChange={(id) => setActiveTab(id as WorkspaceTaskInspectorTabId)}
        items={[
          {
            id: 'details',
            label: translateTabs('details'),
            content: detailsContent,
            isOpen: true,
          },
          {
            id: 'activity',
            label: translateTabs('activity'),
            content: activityContent,
            isOpen: hasActivity,
          },
          {
            id: 'records',
            label: translateTabs('records'),
            content: recordsContent,
            isOpen: true,
          },
        ]}
      />
    </div>
  );
}

function formatConfidence(
  confidence: number | null,
  translate: WorkspaceTranslate,
): string {
  return confidence === null
    ? translate('inspector.notAssessed')
    : translate('inspector.confidencePercent', {
        percent: Math.round(confidence * 100),
      });
}
