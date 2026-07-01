'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { Task } from '@services/management/tasks.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { HiOutlineClock } from 'react-icons/hi2';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import { formatTaskTimestamp } from './workspace-task.helpers';
import type {
  WorkspaceTaskLinkedIssueSummary,
  WorkspaceTaskLinkedOutputSummary,
  WorkspaceTaskLinkedRunSummary,
  WorkspaceTaskOutputGroup,
} from './workspace-task-inspector-helpers';
import { WorkspaceTaskOutputsCard } from './workspace-task-outputs-card';
import { WorkspaceTaskThreadCard } from './workspace-task-thread-card';

interface WorkspaceTaskInspectorBodyProps {
  isBusy: boolean;
  linkedIssueSummary: WorkspaceTaskLinkedIssueSummary;
  linkedOutputGroups: WorkspaceTaskOutputGroup[];
  linkedOutputSummary: WorkspaceTaskLinkedOutputSummary;
  linkedRunSummary: WorkspaceTaskLinkedRunSummary & { isLoading: boolean };
  onKeepOutput: (taskId: string, outputId: string) => Promise<void>;
  onTrashOutput: (taskId: string, outputId: string) => Promise<void>;
  onUnkeepOutput: (taskId: string, outputId: string) => Promise<void>;
  task: Task;
}

export function WorkspaceTaskInspectorBody({
  isBusy,
  linkedIssueSummary,
  linkedOutputGroups,
  linkedOutputSummary,
  linkedRunSummary,
  onKeepOutput,
  onTrashOutput,
  onUnkeepOutput,
  task,
}: WorkspaceTaskInspectorBodyProps) {
  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card bodyClassName="space-y-2 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/35">
            Routing
          </p>
          <p className="text-sm text-foreground">
            {task.routingSummary ?? 'Auto-routed by workspace orchestration.'}
          </p>
        </Card>
        <Card bodyClassName="space-y-2 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/35">
            Progress
          </p>
          <div className="space-y-1 text-sm text-foreground/60">
            <p>{task.progress?.stage ?? 'queued'}</p>
            <p>{task.progress?.percent ?? 0}% complete</p>
            <p>
              {task.progress?.activeRunCount ?? 0} active run
              {task.progress?.activeRunCount === 1 ? '' : 's'}
            </p>
            {task.progress?.message ? <p>{task.progress.message}</p> : null}
            <p className="flex items-center gap-2">
              <HiOutlineClock className="size-4" />
              Updated {formatTaskTimestamp(task)}
            </p>
            {task.createdAt ? (
              <p>
                Created <ClientFormattedDate value={task.createdAt} />
              </p>
            ) : null}
            {task.completedAt ? (
              <p>
                Completed <ClientFormattedDate value={task.completedAt} />
              </p>
            ) : null}
          </div>
        </Card>
      </div>

      {task.resultPreview ? (
        <Card
          label="Result preview"
          bodyClassName="border-l border-emerald-400/30 p-4 text-sm text-foreground/75"
        >
          {task.resultPreview}
        </Card>
      ) : null}

      {(task.eventStream?.length ?? 0) > 0 ? (
        <WorkspaceTaskThreadCard eventStream={task.eventStream ?? []} />
      ) : null}

      {(task.linkedOutputIds?.length ?? 0) > 0 ? (
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

      {linkedRunSummary.reportThreadId ? (
        <Card
          label="Report location"
          bodyClassName="space-y-3 border-l border-sky-400/30 p-4 text-sm text-foreground/75"
        >
          <p>
            This task&apos;s report lives in the linked agent thread, not in the
            workspace task record itself.
          </p>
          <Button
            asChild
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            className="font-semibold"
          >
            <Link
              href={`${APP_ROUTES.AGENT.ROOT}/${linkedRunSummary.reportThreadId}`}
            >
              Open report thread
            </Link>
          </Button>
        </Card>
      ) : null}

      {task.failureReason ? (
        <Card
          label="Failure"
          bodyClassName="border-l border-rose-400/35 p-4 text-sm text-rose-200"
        >
          {task.failureReason}
        </Card>
      ) : null}

      {task.requestedChangesReason ? (
        <Card
          label="Requested changes"
          bodyClassName="border-l border-amber-400/35 p-4 text-sm text-amber-200"
        >
          {task.requestedChangesReason}
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card
          label="Task metadata"
          bodyClassName="space-y-2 p-4 text-sm text-foreground/65"
        >
          <p>Priority: {task.priority}</p>
          <p>
            Review state: {task.reviewState?.replaceAll('_', ' ') ?? 'none'}
          </p>
          <p>Organization: {task.organization}</p>
          {task.brand ? <p>Brand: {task.brand}</p> : null}
        </Card>

        <Card
          label="Linked records"
          bodyClassName="space-y-2 p-4 text-sm text-foreground/65"
        >
          <p>Runs: {task.linkedRunIds?.length ?? 0}</p>
          {task.linkedIssueId ? (
            <p>
              Issue:{' '}
              {linkedIssueSummary.isLoading
                ? 'Loading…'
                : (linkedIssueSummary.identifier ?? 'Unavailable')}
            </p>
          ) : null}
          <p>Outputs: {task.linkedOutputIds?.length ?? 0}</p>
          <p>
            Report threads:{' '}
            {linkedRunSummary.isLoading
              ? 'Loading…'
              : linkedRunSummary.reportThreadCount}
          </p>
          <p>
            Generated content:{' '}
            {linkedRunSummary.isLoading
              ? 'Loading…'
              : linkedRunSummary.generatedContentCount}
          </p>
          <p>Approvals: {task.linkedApprovalIds?.length ?? 0}</p>
          {task.planningThreadId ? (
            <p className="truncate">Thread: {task.planningThreadId}</p>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
