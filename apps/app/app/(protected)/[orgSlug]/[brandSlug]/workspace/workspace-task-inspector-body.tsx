import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { WorkspaceTranslate } from '@props/workspace/workspace-task.props';
import type { WorkspaceTaskInspectorBodyProps } from '@props/workspace/workspace-task-inspector-body.props';
import Card from '@ui/card/Card';
import { PanelTabs } from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import { AlertTriangle, Clock } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
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
      <Card
        label={translate('inspector.routing')}
        bodyClassName="space-y-2 p-4"
      >
        <p className="text-sm text-foreground">
          {task.routingSummary ?? translate('inspector.autoRouted')}
        </p>
      </Card>
      <Card
        label={translate('inspector.progress')}
        bodyClassName="space-y-2 p-4"
      >
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
      <Card
        label={translate('inspector.labels.taskMetadata')}
        bodyClassName="space-y-2 p-4 text-sm text-foreground/65"
      >
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
      </Card>
    </div>
  );

  const activityContent = (
    <div className="space-y-4 p-6">
      {hasResultPreview ? (
        <Card
          label={translate('inspector.labels.resultPreview')}
          bodyClassName="border-l border-emerald-400/30 p-4 text-sm text-foreground/75"
        >
          {task.resultPreview}
        </Card>
      ) : null}

      {continuityQa ? (
        <Card
          label={translate('inspector.labels.visualContinuityQa')}
          bodyClassName="space-y-3 border-l border-amber-400/30 p-4 text-sm text-foreground/75"
        >
          <p className="flex items-center gap-2 font-semibold">
            {continuityQa.summary.driftClipCount > 0 ? (
              <AlertTriangle className="size-4 text-amber-300" />
            ) : null}
            {continuityQa.status.replace('_', ' ')} ·{' '}
            {translate('inspector.driftFindings', {
              count: continuityQa.summary.driftClipCount,
            })}
          </p>
          {continuityQa.skipReason ? (
            <p className="text-foreground/55">
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
                  className="text-amber-200"
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
        <Card
          label={translate('inspector.labels.reportLocation')}
          bodyClassName="space-y-3 border-l border-border p-4 text-sm text-foreground/75"
        >
          <p>{translate('inspector.reportLocationDescription')}</p>
          <Button
            asChild
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            className="font-semibold"
          >
            <Link
              href={`${APP_ROUTES.AGENT.ROOT}/${linkedExecutionSummary.reportThreadId}`}
            >
              {translate('inspector.openReportThread')}
            </Link>
          </Button>
        </Card>
      ) : null}

      {hasFailure ? (
        <Card
          label={translate('inspector.labels.failure')}
          bodyClassName="border-l border-rose-400/35 p-4 text-sm text-rose-200"
        >
          {task.failureReason}
        </Card>
      ) : null}

      {hasRequestedChanges ? (
        <Card
          label={translate('inspector.labels.requestedChanges')}
          bodyClassName="border-l border-amber-400/35 p-4 text-sm text-amber-200"
        >
          {task.requestedChangesReason}
        </Card>
      ) : null}
    </div>
  );

  const recordsContent = (
    <div className="space-y-4 p-6">
      <Card
        label={translate('inspector.labels.linkedRecords')}
        bodyClassName="space-y-2 p-4 text-sm text-foreground/65"
      >
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
