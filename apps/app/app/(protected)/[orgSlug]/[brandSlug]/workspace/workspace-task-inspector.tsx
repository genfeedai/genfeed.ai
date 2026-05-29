'use client';

import { useAuth } from '@clerk/nextjs';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import type { Ingredient } from '@models/content/ingredient.model';
import { AgentRunsService } from '@services/ai/agent-runs.service';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import {
  type Task,
  type TaskEvent,
  TasksService,
} from '@services/management/tasks.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@ui/primitives/sheet';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { HiOutlineClock } from 'react-icons/hi2';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import { buildTaskLaunchHref } from '@/lib/navigation/operator-shell';
import {
  formatTaskStatus,
  formatTaskTimestamp,
  getAdvancedToolHref,
} from './workspace-task.helpers';

// ─── Private types ────────────────────────────────────────────────────────────

interface WorkspaceTaskLinkedRunSummary {
  generatedContentCount: number;
  reportThreadCount: number;
  reportThreadId: string | null;
}

interface WorkspaceTaskLinkedOutputSummary {
  error: string | null;
  isLoading: boolean;
  outputs: Ingredient[];
}

interface WorkspaceTaskOutputGroup {
  children: Ingredient[];
  root: Ingredient;
}

interface WorkspaceTaskLinkedIssueSummary {
  href: string | null;
  identifier: string | null;
  isLoading: boolean;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

function getEmptyLinkedRunSummary(): WorkspaceTaskLinkedRunSummary {
  return {
    generatedContentCount: 0,
    reportThreadCount: 0,
    reportThreadId: null,
  };
}

function getEmptyLinkedOutputSummary(): WorkspaceTaskLinkedOutputSummary {
  return {
    error: null,
    isLoading: false,
    outputs: [],
  };
}

function getEmptyLinkedIssueSummary(): WorkspaceTaskLinkedIssueSummary {
  return {
    href: null,
    identifier: null,
    isLoading: false,
  };
}

function getWorkspaceLinkedOutputTitle(output: Ingredient): string {
  const metadataLabel = output.metadataLabel?.trim();
  if (metadataLabel) {
    return metadataLabel;
  }

  const metadataDescription = output.metadataDescription?.trim();
  if (metadataDescription) {
    return metadataDescription;
  }

  const promptText = output.promptText?.trim();
  if (promptText) {
    return promptText;
  }

  return output.id;
}

function getWorkspaceLinkedOutputDescription(
  output: Ingredient,
): string | null {
  const metadataDescription = output.metadataDescription?.trim();
  if (metadataDescription) {
    return metadataDescription;
  }

  const promptText = output.promptText?.trim();
  if (promptText) {
    return promptText;
  }

  return null;
}

function groupWorkspaceLinkedOutputs(
  outputs: Ingredient[],
): WorkspaceTaskOutputGroup[] {
  const activeOutputs = outputs.filter((output) => output.isDeleted !== true);
  const outputMap = new Map(activeOutputs.map((output) => [output.id, output]));
  const groups = new Map<string, WorkspaceTaskOutputGroup>();

  for (const output of activeOutputs) {
    const parentId =
      typeof output.parent === 'string'
        ? output.parent
        : (output.parent?.id ?? null);
    const rootId = parentId && outputMap.has(parentId) ? parentId : output.id;
    const root = outputMap.get(rootId) ?? output;
    const existingGroup = groups.get(rootId);

    if (!existingGroup) {
      groups.set(rootId, {
        children: root.id === output.id ? [] : [output],
        root,
      });
      continue;
    }

    if (output.id !== existingGroup.root.id) {
      existingGroup.children.push(output);
    }
  }

  return Array.from(groups.values()).toSorted((left, right) => {
    const leftTime = new Date(left.root.updatedAt ?? left.root.createdAt ?? 0);
    const rightTime = new Date(
      right.root.updatedAt ?? right.root.createdAt ?? 0,
    );
    return rightTime.getTime() - leftTime.getTime();
  });
}

function formatWorkspaceEventLabel(event: TaskEvent): string {
  switch (event.type) {
    case 'task_queued':
      return 'Task queued';
    case 'task_started':
      return 'Task started';
    case 'runs_linked':
      return 'Runs linked';
    case 'run_queued':
      return 'Run queued';
    case 'run_started':
      return 'Run started';
    case 'run_completed':
      return 'Run completed';
    case 'run_failed':
      return 'Run failed';
    case 'task_ready_for_review':
      return 'Ready for review';
    case 'task_failed':
      return 'Task failed';
    case 'task_approved':
      return 'Task approved';
    case 'task_changes_requested':
      return 'Changes requested';
    case 'task_dismissed':
      return 'Task dismissed';
    case 'output_kept':
      return 'Output kept';
    case 'output_unkept':
      return 'Output removed from keep';
    case 'output_trashed':
      return 'Output trashed';
    default:
      return event.type.replaceAll('_', ' ');
  }
}

function getWorkspaceEventMessage(event: TaskEvent): string | null {
  const message = event.payload?.message;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }

  const summary = event.payload?.summary;
  if (typeof summary === 'string' && summary.trim().length > 0) {
    return summary;
  }

  const resultPreview = event.payload?.resultPreview;
  if (typeof resultPreview === 'string' && resultPreview.trim().length > 0) {
    return resultPreview;
  }

  const reason = event.payload?.reason;
  if (typeof reason === 'string' && reason.trim().length > 0) {
    return reason;
  }

  const error = event.payload?.error;
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  return null;
}

// ─── Private hooks ────────────────────────────────────────────────────────────

function useWorkspaceTaskLinkedRunSummary(
  task: Task | null,
): WorkspaceTaskLinkedRunSummary & { isLoading: boolean } {
  const { getToken } = useAuth();
  const [summary, setSummary] = useState<WorkspaceTaskLinkedRunSummary>(() =>
    getEmptyLinkedRunSummary(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const _linkedRunIdsKey = useMemo(
    () => task?.linkedRunIds?.join('|') ?? '',
    [task?.linkedRunIds],
  );

  useEffect(() => {
    if (!task || (task.linkedRunIds?.length ?? 0) === 0) {
      setSummary(getEmptyLinkedRunSummary());
      setIsLoading(false);
      return;
    }

    const capturedTask = task;
    const linkedRunIds = capturedTask.linkedRunIds ?? [];

    let isCancelled = false;

    async function loadLinkedRunSummary() {
      try {
        setIsLoading(true);
        const token = await resolveClerkToken(getToken);
        if (isCancelled) {
          return;
        }

        if (!token) {
          setSummary(getEmptyLinkedRunSummary());
          setIsLoading(false);
          return;
        }

        const service = AgentRunsService.getInstance(token);
        const batchResults = await service.getBatch(linkedRunIds);

        if (isCancelled) {
          return;
        }

        const reportThreadIds = Array.from(
          batchResults.reduce<Set<string>>((threadIds, result) => {
            if (isNonEmptyString(result.threadId)) {
              threadIds.add(result.threadId);
            }
            return threadIds;
          }, new Set()),
        );

        setSummary({
          generatedContentCount: batchResults.reduce(
            (total, result) => total + result.contentCount,
            0,
          ),
          reportThreadCount: reportThreadIds.length,
          reportThreadId: reportThreadIds[0] ?? null,
        });
      } catch (error: unknown) {
        if (isCancelled) {
          return;
        }

        logger.warn('Failed to resolve workspace task run summary', {
          error,
          reportToSentry: false,
          taskId: capturedTask.id,
        });
        setSummary(getEmptyLinkedRunSummary());
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadLinkedRunSummary();

    return () => {
      isCancelled = true;
    };
  }, [getToken, task]);

  return {
    ...summary,
    isLoading,
  };
}

function useWorkspaceTaskLinkedOutputs(
  task: Task | null,
): WorkspaceTaskLinkedOutputSummary {
  const { getToken } = useAuth();
  const [summary, setSummary] = useState<WorkspaceTaskLinkedOutputSummary>(() =>
    getEmptyLinkedOutputSummary(),
  );
  const _linkedOutputIdsKey = useMemo(
    () => task?.linkedOutputIds?.join('|') ?? '',
    [task?.linkedOutputIds],
  );

  useEffect(() => {
    if (!task || (task.linkedOutputIds?.length ?? 0) === 0) {
      setSummary(getEmptyLinkedOutputSummary());
      return;
    }

    const capturedTask = task;
    let isCancelled = false;

    async function loadLinkedOutputs() {
      try {
        setSummary((current) => ({
          ...current,
          error: null,
          isLoading: true,
        }));

        const token = await resolveClerkToken(getToken);
        if (isCancelled) {
          return;
        }

        if (!token) {
          setSummary(getEmptyLinkedOutputSummary());
          return;
        }

        const service = IngredientsService.getInstance(token);
        const linkedOutputIds = Array.from(
          new Set(capturedTask.linkedOutputIds ?? []),
        );
        const outputs = await service.findByIds(linkedOutputIds);

        if (isCancelled) {
          return;
        }

        setSummary({
          error: null,
          isLoading: false,
          outputs: outputs as Ingredient[],
        });
      } catch (error: unknown) {
        if (isCancelled) {
          return;
        }

        logger.warn('Failed to resolve workspace task linked outputs', {
          error,
          reportToSentry: false,
          taskId: capturedTask.id,
        });
        setSummary({
          error: 'Linked outputs could not be loaded right now.',
          isLoading: false,
          outputs: [],
        });
      }
    }

    void loadLinkedOutputs();

    return () => {
      isCancelled = true;
    };
  }, [getToken, task]);

  return summary;
}

function useWorkspaceTaskLinkedIssue(
  task: Task | null,
): WorkspaceTaskLinkedIssueSummary {
  const { getToken } = useAuth();
  const [summary, setSummary] = useState<WorkspaceTaskLinkedIssueSummary>(() =>
    getEmptyLinkedIssueSummary(),
  );

  useEffect(() => {
    if (!task?.linkedIssueId) {
      setSummary(getEmptyLinkedIssueSummary());
      return;
    }

    const capturedTask = task;
    let isCancelled = false;

    async function loadLinkedIssue() {
      try {
        setSummary({
          href: null,
          identifier: null,
          isLoading: true,
        });

        const linkedId = capturedTask.linkedIssueId;
        if (!linkedId) {
          setSummary(getEmptyLinkedIssueSummary());
          return;
        }

        const token = await resolveClerkToken(getToken);
        if (!token || isCancelled) {
          setSummary(getEmptyLinkedIssueSummary());
          return;
        }

        const issue = await TasksService.getInstance(token).findOne(linkedId);

        if (isCancelled) {
          return;
        }

        setSummary({
          href: `/tasks/${issue.identifier}`,
          identifier: issue.identifier,
          isLoading: false,
        });
      } catch (error: unknown) {
        if (isCancelled) {
          return;
        }

        logger.warn('Failed to resolve workspace task linked issue', {
          error,
          reportToSentry: false,
          taskId: capturedTask.id,
        });
        setSummary(getEmptyLinkedIssueSummary());
      }
    }

    void loadLinkedIssue();

    return () => {
      isCancelled = true;
    };
  }, [getToken, task]);

  return summary;
}

// ─── Public component ─────────────────────────────────────────────────────────

type WorkspaceTaskInspectorProps = {
  busyTaskId: string | null;
  onApprove: (taskId: string) => Promise<void>;
  onDismiss: (taskId: string) => Promise<void>;
  onKeepOutput: (taskId: string, outputId: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onPlanNextSteps: (task: Task) => Promise<void>;
  onRequestChanges: (taskId: string) => Promise<void>;
  onTrashOutput: (taskId: string, outputId: string) => Promise<void>;
  onUnkeepOutput: (taskId: string, outputId: string) => Promise<void>;
  task: Task | null;
};

export function WorkspaceTaskInspector({
  busyTaskId,
  onApprove,
  onDismiss,
  onKeepOutput,
  onOpenChange,
  onPlanNextSteps,
  onRequestChanges,
  onTrashOutput,
  onUnkeepOutput,
  task,
}: WorkspaceTaskInspectorProps) {
  const isBusy = busyTaskId === task?.id;
  const showReviewActions = task?.reviewState === 'pending_approval';
  const linkedIssueSummary = useWorkspaceTaskLinkedIssue(task);
  const linkedRunSummary = useWorkspaceTaskLinkedRunSummary(task);
  const linkedOutputSummary = useWorkspaceTaskLinkedOutputs(task);
  const taskToolHref =
    task && linkedRunSummary.reportThreadId
      ? `/chat/${linkedRunSummary.reportThreadId}`
      : task
        ? getAdvancedToolHref(task)
        : '/orchestration/runs';
  const taskToolLabel = linkedRunSummary.reportThreadId
    ? 'Open Report'
    : 'Open Tool';
  const linkedOutputGroups = useMemo(
    () => groupWorkspaceLinkedOutputs(linkedOutputSummary.outputs),
    [linkedOutputSummary.outputs],
  );

  return (
    <Sheet open={Boolean(task)} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-white/10 bg-[#090909] p-0 sm:max-w-2xl"
      >
        {task ? (
          <div
            className="flex min-h-full flex-col"
            data-testid="workspace-task-inspector"
          >
            <div className="border-b border-white/[0.08] px-6 py-5 pr-14">
              <SheetHeader className="space-y-3 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/65">
                    {formatTaskStatus(task)}
                  </span>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
                    {task.outputType}
                  </span>
                  {task.executionPathUsed ? (
                    <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
                      {task.executionPathUsed.replaceAll('_', ' ')}
                    </span>
                  ) : null}
                </div>

                <SheetTitle className="text-2xl tracking-[-0.03em]">
                  {task.title}
                </SheetTitle>
                <SheetDescription className="text-sm leading-6 text-foreground/55">
                  {task.request}
                </SheetDescription>
              </SheetHeader>
            </div>

            <div className="flex-1 space-y-6 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Card bodyClassName="space-y-2 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/35">
                    Routing
                  </p>
                  <p className="text-sm text-foreground">
                    {task.routingSummary ??
                      'Auto-routed by workspace orchestration.'}
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
                    {task.progress?.message ? (
                      <p>{task.progress.message}</p>
                    ) : null}
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
                        Completed{' '}
                        <ClientFormattedDate value={task.completedAt} />
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
                  <div
                    className="space-y-3"
                    data-testid="workspace-task-events"
                  >
                    {[...(task.eventStream ?? [])]
                      .slice()
                      .sort((left, right) =>
                        (right.timestamp ?? '').localeCompare(
                          left.timestamp ?? '',
                        ),
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
                      Review all active variants here. Kept outputs stay
                      visible; trashed variants disappear from the thread.
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
                    <p className="text-amber-200">
                      {linkedOutputSummary.error}
                    </p>
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
                                const isKept = (
                                  task.approvedOutputIds ?? []
                                ).includes(output.id);

                                return (
                                  <div
                                    key={output.id}
                                    className="rounded-lg border border-white/10 bg-black/30 p-3"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="space-y-1">
                                        <p className="font-medium text-foreground">
                                          {getWorkspaceLinkedOutputTitle(
                                            output,
                                          )}
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
                                        {isKept
                                          ? 'Remove from kept'
                                          : 'Keep output'}
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
                    This task&apos;s report lives in the linked agent thread,
                    not in the workspace task record itself.
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
                    Review state:{' '}
                    {task.reviewState?.replaceAll('_', ' ') ?? 'none'}
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

            <div className="border-t border-white/[0.08] px-6 py-4 space-y-3">
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
                <Button
                  asChild
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.SM}
                >
                  <Link href={buildTaskLaunchHref(task, 'write')}>
                    Open in Write
                  </Link>
                </Button>
                <Button
                  asChild
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.SM}
                >
                  <Link href={buildTaskLaunchHref(task, 'generate')}>
                    Open in Generate
                  </Link>
                </Button>
                <Button
                  asChild
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.SM}
                >
                  <Link href={buildTaskLaunchHref(task, 'edit')}>
                    Open in Edit
                  </Link>
                </Button>
                <Button
                  asChild
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.SM}
                >
                  <Link href={buildTaskLaunchHref(task, 'automate')}>
                    Open in Automate
                  </Link>
                </Button>
                {linkedIssueSummary.href ? (
                  <Button
                    asChild
                    variant={ButtonVariant.GHOST}
                    size={ButtonSize.SM}
                  >
                    <Link href={linkedIssueSummary.href}>Open Issue</Link>
                  </Button>
                ) : null}
                <Button
                  asChild
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.SM}
                >
                  <Link href={taskToolHref}>{taskToolLabel}</Link>
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
