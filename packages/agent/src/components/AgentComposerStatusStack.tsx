import { AgentInputRequestOverlay } from '@genfeedai/agent/components/AgentInputRequestOverlay';
import type {
  AgentInputRequest,
  AgentProposedPlan,
  AgentWorkEvent,
} from '@genfeedai/agent/models/agent-chat.model';
import { AgentWorkEventStatus } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentSocketConnectionState } from '@genfeedai/agent/stores/agent-chat.store';
import { isGenericRunLifecycleEvent } from '@genfeedai/agent/utils/derive-timeline';
import { formatAgentError } from '@genfeedai/agent/utils/format-agent-error.util';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Progress } from '@ui/primitives/progress';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  ListChecks,
  SignalZero,
  TriangleAlert,
  X,
} from 'lucide-react';
import { type ReactElement, useCallback, useMemo, useState } from 'react';
import { buildAgentRunFailureCopyText } from './AgentRunFailureCard';

interface AgentComposerStatusStackProps {
  activeWorkEvent: AgentWorkEvent | null;
  error: string | null;
  isRunActive: boolean;
  isSubmittingInputRequest: boolean;
  latestProposedPlan: AgentProposedPlan | null;
  onClearError: () => void;
  onSubmitInputRequest: (answer: string) => void | Promise<void>;
  pendingInputRequest: AgentInputRequest | null;
  socketConnectionState: AgentSocketConnectionState;
  workEvents: readonly AgentWorkEvent[];
}

type ComposerTaskStatus =
  | 'active'
  | 'cancelled'
  | 'completed'
  | 'failed'
  | 'pending';

interface ComposerTask {
  detail?: string;
  id: string;
  label: string;
  progress?: number;
  status: ComposerTaskStatus;
}

// Composer-owned status (Claude/T3): sits above the glass bar, not in the
// timeline. Compact surfaces so the stack never steals half the viewport.
const STATUS_SURFACE_CLASS =
  'rounded-lg border bg-background-secondary/95 px-2.5 py-1.5 shadow-sm backdrop-blur-sm';

function splitComposerError(error: string): {
  detail: string | null;
  recovery: string | null;
  summary: string;
  title: string;
} {
  const formatted = formatAgentError(error);
  return {
    detail: formatted.detail,
    recovery: formatted.recovery,
    summary: formatted.summary,
    title: formatted.title,
  };
}

function getDeterminateProgress(event: AgentWorkEvent): number | null {
  if (
    typeof event.progress !== 'number' ||
    !Number.isFinite(event.progress) ||
    event.progress < 0 ||
    event.progress > 100
  ) {
    return null;
  }

  return event.progress;
}

function normalizeTaskStatus(status: unknown): ComposerTaskStatus {
  if (typeof status !== 'string') {
    return 'pending';
  }

  switch (status.toLowerCase()) {
    case 'active':
    case 'in_progress':
    case 'running':
      return 'active';
    case 'complete':
    case 'completed':
    case 'done':
    case 'succeeded':
      return 'completed';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    case 'failed':
    case 'error':
      return 'failed';
    default:
      return 'pending';
  }
}

function getWorkTaskStatus(event: AgentWorkEvent): ComposerTaskStatus {
  switch (event.status) {
    case AgentWorkEventStatus.RUNNING:
      return 'active';
    case AgentWorkEventStatus.COMPLETED:
      return 'completed';
    case AgentWorkEventStatus.FAILED:
      return 'failed';
    case AgentWorkEventStatus.CANCELLED:
      return 'cancelled';
    default:
      return 'pending';
  }
}

function buildPlanTasks(
  plan: AgentProposedPlan | null,
  isRunActive: boolean,
): ComposerTask[] {
  if (!isRunActive || plan?.status !== 'approved') {
    return [];
  }

  const tasks = (plan.steps ?? []).flatMap((step, index) => {
    const label = typeof step.step === 'string' ? step.step.trim() : '';
    if (!label) {
      return [];
    }

    return [
      {
        id: `${plan.id}:step:${index}`,
        label,
        status: normalizeTaskStatus(step.status),
      } satisfies ComposerTask,
    ];
  });

  // Approved plans may arrive with every step still marked pending. While the
  // run is active, identify the next pending step as current without claiming
  // that any unreported step has completed.
  if (!tasks.some((task) => task.status === 'active')) {
    const nextPending = tasks.find((task) => task.status === 'pending');
    if (nextPending) {
      nextPending.status = 'active';
    }
  }

  return tasks;
}

function buildWorkTasks(workEvents: readonly AgentWorkEvent[]): ComposerTask[] {
  const tasks = new Map<string, ComposerTask>();

  for (const event of workEvents) {
    if (isGenericRunLifecycleEvent(event) || !event.label.trim()) {
      continue;
    }

    const id = event.toolCallId ?? event.toolName ?? event.label;
    tasks.set(id, {
      detail: event.detail,
      id,
      label: event.label,
      progress: getDeterminateProgress(event) ?? undefined,
      status: getWorkTaskStatus(event),
    });
  }

  return [...tasks.values()].slice(-8);
}

export function hasRenderableComposerTasks({
  isRunActive,
  latestProposedPlan,
  workEvents,
}: {
  isRunActive: boolean;
  latestProposedPlan: AgentProposedPlan | null;
  workEvents: readonly AgentWorkEvent[];
}): boolean {
  if (!isRunActive) {
    return false;
  }

  return (
    buildPlanTasks(latestProposedPlan, true).length > 0 ||
    buildWorkTasks(workEvents).length > 0
  );
}

function TaskStatusIcon({ status }: { status: ComposerTaskStatus }) {
  if (status === 'completed') {
    return <Check aria-hidden className="size-3.5 text-success" />;
  }
  if (status === 'failed') {
    return <TriangleAlert aria-hidden className="size-3.5 text-destructive" />;
  }
  if (status === 'active') {
    return (
      <span
        aria-hidden
        className="inline-flex size-3.5 items-center justify-center"
      >
        <span className="size-1.5 rounded-full bg-primary" />
      </span>
    );
  }
  return (
    <Circle
      aria-hidden
      className={cn(
        'size-3.5',
        status === 'cancelled' ? 'text-foreground/20' : 'text-foreground/30',
      )}
    />
  );
}

export function AgentComposerStatusStack({
  activeWorkEvent,
  error,
  isRunActive,
  isSubmittingInputRequest,
  latestProposedPlan,
  onClearError,
  onSubmitInputRequest,
  pendingInputRequest,
  socketConnectionState,
  workEvents,
}: AgentComposerStatusStackProps): ReactElement | null {
  const composerError = error ? splitComposerError(error) : null;
  const [isErrorCopied, setIsErrorCopied] = useState(false);
  const [isTasksExpanded, setIsTasksExpanded] = useState(true);
  const handleCopyError = useCallback(async () => {
    if (!error) {
      return;
    }
    try {
      await ClipboardService.getInstance().copyToClipboard(
        buildAgentRunFailureCopyText(error),
      );
      setIsErrorCopied(true);
      window.setTimeout(() => setIsErrorCopied(false), 1500);
    } catch {
      setIsErrorCopied(false);
    }
  }, [error]);
  // Lifecycle bookends ("Agent started") are not useful sticky status — only
  // real tool/progress work belongs above the composer.
  const meaningfulWorkEvent =
    activeWorkEvent && !isGenericRunLifecycleEvent(activeWorkEvent)
      ? activeWorkEvent
      : null;
  const determinateProgress = meaningfulWorkEvent
    ? getDeterminateProgress(meaningfulWorkEvent)
    : null;
  const tasks = useMemo(() => {
    const planTasks = buildPlanTasks(latestProposedPlan, isRunActive);
    return planTasks.length > 0 ? planTasks : buildWorkTasks(workEvents);
  }, [isRunActive, latestProposedPlan, workEvents]);
  const visibleTasks = isRunActive ? tasks : [];
  const completedTaskCount = visibleTasks.filter(
    (task) => task.status === 'completed',
  ).length;
  const hasConnectionWarning = socketConnectionState !== 'connected';
  const hasPlanReview = latestProposedPlan?.status === 'awaiting_approval';

  if (
    visibleTasks.length === 0 &&
    !error &&
    !hasConnectionWarning &&
    !hasPlanReview &&
    !pendingInputRequest
  ) {
    return null;
  }

  return (
    <div
      aria-label="Conversation status and pending input"
      // Cap height so status cards scroll instead of growing into the
      // overflow-hidden workspace canvas and clipping during reconnect thrash.
      className={cn(
        'max-h-[min(40dvh,20rem)] space-y-2 overflow-x-hidden overflow-y-auto overscroll-contain',
        // Terminal errors are notices, not part of the composer chrome. Keep
        // them visibly separate from the prompt instead of fusing both cards.
        composerError && 'pb-2',
      )}
      role="region"
    >
      {pendingInputRequest ? (
        <AgentInputRequestOverlay
          key={pendingInputRequest.inputRequestId}
          isSubmitting={isSubmittingInputRequest}
          onSubmit={onSubmitInputRequest}
          request={pendingInputRequest}
          variant="composer"
        />
      ) : null}

      {composerError ? (
        <div
          className={cn(
            STATUS_SURFACE_CLASS,
            // T3-style hierarchy: a compact, solid notice with destructive
            // accents. The entire card should not become a translucent red
            // extension of the prompt bar.
            'mx-auto flex w-full max-w-2xl items-start gap-2 border-destructive/35 bg-background-secondary text-foreground shadow-border backdrop-blur-none',
          )}
          role="alert"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-sm leading-5 text-destructive">
              {composerError.title}
            </p>
            <p className="text-xs leading-5 text-foreground/80">
              {composerError.summary}
            </p>
            {composerError.detail ? (
              <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words font-mono text-2xs leading-5 text-foreground/65">
                {composerError.detail}
              </p>
            ) : null}
            {composerError.recovery ? (
              <p className="text-2xs leading-5 text-muted-foreground">
                {composerError.recovery}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-start gap-0.5">
            <Button
              ariaLabel={isErrorCopied ? 'Error copied' : 'Copy error'}
              tooltip={isErrorCopied ? 'Copied' : 'Copy error for agent'}
              className="size-7 text-destructive hover:bg-destructive/20 hover:text-destructive"
              icon={
                isErrorCopied ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )
              }
              onClick={() => {
                void handleCopyError();
              }}
              size={ButtonSize.ICON}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
            <Button
              ariaLabel="Dismiss composer error"
              className="size-7 text-destructive hover:bg-destructive/20 hover:text-destructive"
              icon={<X className="size-4" />}
              onClick={onClearError}
              size={ButtonSize.ICON}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          </div>
        </div>
      ) : null}

      {hasConnectionWarning ? (
        <div
          aria-live="polite"
          className={cn(
            STATUS_SURFACE_CLASS,
            'flex min-w-0 items-center gap-2 border-warning/50 bg-warning/15 text-sm leading-5 text-warning',
          )}
          role="status"
        >
          <SignalZero className="size-4 shrink-0 text-warning" aria-hidden />
          <p className="min-w-0 break-words font-medium text-warning">
            {socketConnectionState === 'offline'
              ? 'Offline. Your draft is safe; sending is paused.'
              : socketConnectionState === 'connecting'
                ? 'Connecting. Your draft is safe; sending starts when connected.'
                : 'Reconnecting. Your draft is safe; sending resumes when connected.'}
          </p>
        </div>
      ) : null}

      {visibleTasks.length > 0 ? (
        <div
          aria-live="polite"
          aria-label={`Tasks ${completedTaskCount} of ${visibleTasks.length}`}
          className="overflow-hidden rounded-t-lg rounded-b-none border border-border/70 bg-background/72 shadow-sm backdrop-blur-xl"
          data-testid="agent-composer-tasks"
          role="region"
        >
          <div className="flex min-h-8 items-center gap-2 px-2.5 py-1">
            <ListChecks aria-hidden className="size-3.5 text-foreground/55" />
            <span className="text-xs font-medium text-foreground/82">
              Tasks
            </span>
            <span className="text-2xs tabular-nums text-muted-foreground">
              {completedTaskCount}/{visibleTasks.length}
            </span>
            <div className="ml-auto flex items-center gap-0.5" aria-hidden>
              {visibleTasks.slice(0, 8).map((task) => (
                <span
                  className={cn(
                    'h-0.5 w-2 rounded-full',
                    task.status === 'completed' && 'bg-success',
                    task.status === 'active' && 'bg-primary',
                    task.status === 'failed' && 'bg-destructive',
                    (task.status === 'pending' ||
                      task.status === 'cancelled') &&
                      'bg-foreground/16',
                  )}
                  key={task.id}
                />
              ))}
            </div>
            <Button
              ariaLabel={isTasksExpanded ? 'Collapse tasks' : 'Expand tasks'}
              className="size-6 shrink-0 p-0 text-muted-foreground"
              icon={
                isTasksExpanded ? (
                  <ChevronUp className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )
              }
              onClick={() => setIsTasksExpanded((current) => !current)}
              size={ButtonSize.ICON}
              tooltip={isTasksExpanded ? 'Collapse tasks' : 'Expand tasks'}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          </div>
          {isTasksExpanded ? (
            <ol className="max-h-36 overflow-y-auto border-border/60 border-t px-2.5 py-1.5">
              {visibleTasks.map((task) => (
                <li
                  className="flex min-w-0 items-center gap-2 py-0.5"
                  data-task-status={task.status}
                  key={task.id}
                >
                  <TaskStatusIcon status={task.status} />
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-xs leading-5',
                      task.status === 'completed' || task.status === 'cancelled'
                        ? 'text-foreground/38'
                        : 'text-foreground/78',
                    )}
                  >
                    {task.label}
                    {task.status === 'active' && task.detail
                      ? ` · ${task.detail}`
                      : null}
                  </span>
                  {task.status === 'active' && task.progress !== undefined ? (
                    <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                      {Math.round(task.progress)}%
                    </span>
                  ) : null}
                </li>
              ))}
              {meaningfulWorkEvent && determinateProgress !== null ? (
                <li className="pb-0.5 pt-1">
                  <Progress
                    aria-label={`${meaningfulWorkEvent.label} progress`}
                    aria-valuetext={`${Math.round(determinateProgress)} percent`}
                    className="h-1"
                    value={determinateProgress}
                  />
                </li>
              ) : null}
            </ol>
          ) : null}
        </div>
      ) : null}

      {hasPlanReview ? (
        <div
          className={cn(
            STATUS_SURFACE_CLASS,
            'border-border text-muted-foreground text-xs leading-5',
          )}
          role="status"
        >
          A plan is ready for explicit review in the conversation. This notice
          does not approve or execute it.
        </div>
      ) : null}
    </div>
  );
}
