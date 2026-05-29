'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { Task } from '@services/management/tasks.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { HiOutlineClock } from 'react-icons/hi2';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import { formatTaskTimestamp } from './workspace-task.helpers';
import {
  formatWorkspaceEventLabel,
  getWorkspaceEventMessage,
  getWorkspaceLinkedOutputDescription,
  getWorkspaceLinkedOutputTitle,
  type WorkspaceTaskLinkedIssueSummary,
  type WorkspaceTaskLinkedOutputSummary,
  type WorkspaceTaskLinkedRunSummary,
  type WorkspaceTaskOutputGroup,
} from './workspace-task-inspector-helpers';

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
        <Card
          label="Task thread"
          bodyClassName="space-y-3 border-l border-sky-400/30 p-4 text-sm text-foreground/75"
        >
          <div className="space-y-3" data-testid="workspace-task-events">
            {[...(task.eventStream ?? [])]
              .slice()
              .sort((left, right) =>
                (right.timestamp ?? '').localeCompare(left.timestamp ?? ''),
              )
              .map((event) => {
                const message = getWorkspaceEventMessage(event);

                return (
                  <article
                    key={event.id}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-foreground">
                        {formatWorkspaceEventLabel(event)}
                      </p>
                      <ClientFormattedDate
                        className="text-xs text-foreground/40"
                        value={event.timestamp}
                      />
                    </div>
                    {message ? (
                      <p className="mt-2 text-sm text-foreground/60">
                        {message}
                      </p>
                    ) : null}
                  </article>
                );
              })}
          </div>
        </Card>
      ) : null}

      {(task.linkedOutputIds?.length ?? 0) > 0 ? (
        <Card
          label="Generated outputs"
          bodyClassName="space-y-3 border-l border-emerald-400/25 p-4 text-sm text-foreground/75"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-foreground/70">
              Review all active variants here. Kept outputs stay visible;
              trashed variants disappear from the thread.
            </p>
            <Button
              asChild
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              className="font-semibold"
            >
              <Link href="/library/ingredients">Open library</Link>
            </Button>
          </div>

          {linkedOutputSummary.isLoading ? (
            <p>Loading linked outputs…</p>
          ) : null}

          {linkedOutputSummary.error ? (
            <p className="text-amber-200">{linkedOutputSummary.error}</p>
          ) : null}

          {linkedOutputGroups.length > 0 ? (
            <div
              className="space-y-3"
              data-testid="workspace-task-linked-outputs"
            >
              {linkedOutputGroups.map((group) => {
                const outputs = [group.root, ...group.children];
                return (
                  <article
                    key={group.root.id}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-foreground">
                        {getWorkspaceLinkedOutputTitle(group.root)}
                      </p>
                      <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
                        {outputs.length} variant
                        {outputs.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {outputs.map((output) => {
                        const description =
                          getWorkspaceLinkedOutputDescription(output);
                        const isKept = (task.approvedOutputIds ?? []).includes(
                          output.id,
                        );

                        return (
                          <div
                            key={output.id}
                            className="rounded-lg border border-white/10 bg-black/30 p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="space-y-1">
                                <p className="font-medium text-foreground">
                                  {getWorkspaceLinkedOutputTitle(output)}
                                </p>
                                <p className="text-xs text-foreground/40">
                                  {output.category ?? task.outputType}
                                  {output.id === group.root.id
                                    ? ' · parent'
                                    : ' · variant'}
                                </p>
                              </div>
                              {isKept ? (
                                <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
                                  Kept
                                </span>
                              ) : null}
                            </div>

                            {description ? (
                              <p className="mt-2 line-clamp-3 text-sm text-foreground/60">
                                {description}
                              </p>
                            ) : null}

                            <p className="mt-2 text-xs text-foreground/40">
                              ID: {output.id}
                            </p>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                size={ButtonSize.SM}
                                variant={ButtonVariant.SECONDARY}
                                disabled={isBusy}
                                onClick={() =>
                                  void (isKept
                                    ? onUnkeepOutput(task.id, output.id)
                                    : onKeepOutput(task.id, output.id))
                                }
                              >
                                {isKept ? 'Remove from kept' : 'Keep output'}
                              </Button>
                              <Button
                                size={ButtonSize.SM}
                                variant={ButtonVariant.SECONDARY}
                                disabled={isBusy}
                                onClick={() =>
                                  void onTrashOutput(task.id, output.id)
                                }
                              >
                                Trash
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </Card>
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
            <Link href={`/chat/${linkedRunSummary.reportThreadId}`}>
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
