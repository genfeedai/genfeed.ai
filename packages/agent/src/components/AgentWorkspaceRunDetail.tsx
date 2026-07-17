import type { AgentRunSummary } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import type { ReactElement, ReactNode } from 'react';
import {
  HiOutlineArrowPath,
  HiOutlineNoSymbol,
  HiOutlinePlayCircle,
} from 'react-icons/hi2';
import {
  formatRunDuration,
  formatRunStatus,
  getRunProgress,
  getRunProvenanceItems,
  getRunStatusClassName,
  getRunThreadId,
  isRunCancellable,
  isRunRetryable,
} from './agent-workspace-run.helpers';

type AgentWorkspaceRunDetailProps = {
  actionRunId: string | null;
  detailError: string | null;
  isLoading: boolean;
  onCancel: (runId: string) => void;
  onOpenThread?: (threadId: string) => void;
  onReload: () => void;
  onRetry: (runId: string) => void;
  run: AgentRunSummary | null;
};

export function AgentRunStatusBadge({
  status,
}: {
  status?: string;
}): ReactElement {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
        getRunStatusClassName(status),
      )}
    >
      {formatRunStatus(status)}
    </span>
  );
}

function AgentRunThreadAction({
  onOpenThread,
  run,
}: Pick<AgentWorkspaceRunDetailProps, 'onOpenThread'> & {
  run: AgentRunSummary;
}): ReactElement | null {
  const threadId = getRunThreadId(run);
  if (!threadId || !onOpenThread) {
    return null;
  }

  return (
    <Button
      ariaLabel={`Open ${run.label} thread`}
      size={ButtonSize.XS}
      variant={ButtonVariant.OUTLINE}
      withWrapper={false}
      onClick={() => onOpenThread(threadId)}
    >
      <HiOutlinePlayCircle aria-hidden="true" className="size-4" />
      Open thread
    </Button>
  );
}

function AgentRunCancelAction({
  actionRunId,
  onCancel,
  run,
}: Pick<
  AgentWorkspaceRunDetailProps,
  'actionRunId' | 'onCancel'
> & { run: AgentRunSummary }): ReactElement | null {
  if (!isRunCancellable(run.status)) {
    return null;
  }

  return (
    <Button
      ariaLabel={`Cancel ${run.label}`}
      isLoading={actionRunId === run.id}
      size={ButtonSize.XS}
      variant={ButtonVariant.DESTRUCTIVE}
      withWrapper={false}
      onClick={() => onCancel(run.id)}
    >
      <HiOutlineNoSymbol aria-hidden="true" className="size-4" />
      Cancel
    </Button>
  );
}

function AgentRunRetryAction({
  actionRunId,
  onRetry,
  run,
}: Pick<AgentWorkspaceRunDetailProps, 'actionRunId' | 'onRetry'> & {
  run: AgentRunSummary;
}): ReactElement | null {
  if (!isRunRetryable(run.status)) {
    return null;
  }

  return (
    <Button
      ariaLabel={`Retry ${run.label}`}
      isLoading={actionRunId === run.id}
      size={ButtonSize.XS}
      variant={ButtonVariant.OUTLINE}
      withWrapper={false}
      onClick={() => onRetry(run.id)}
    >
      <HiOutlineArrowPath aria-hidden="true" className="size-4" />
      Retry
    </Button>
  );
}

function AgentRunProgress({ run }: { run: AgentRunSummary }): ReactElement {
  const progress = getRunProgress(run);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Progress</span>
        <span>{progress}%</span>
      </div>
      <div
        aria-label="Run progress"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress}
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function AgentRunFailure({
  error,
}: {
  error?: string;
}): ReactElement | null {
  if (!error) {
    return null;
  }

  return (
    <div
      className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
      role="alert"
    >
      <p className="font-semibold">Run failed</p>
      <p className="mt-1 whitespace-pre-wrap break-words">{error}</p>
    </div>
  );
}

function AgentRunProvenance({ run }: { run: AgentRunSummary }): ReactElement {
  const items = getRunProvenanceItems(run);

  return (
    <section aria-labelledby={`agent-run-${run.id}-provenance`}>
      <h4
        className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        id={`agent-run-${run.id}-provenance`}
      >
        Provenance
      </h4>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 text-sm lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className={cn('mt-0.5 text-foreground', item.className)}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function AgentRunDetailSection({
  children,
  id,
  title,
}: {
  children: ReactNode;
  id: string;
  title: string;
}): ReactElement {
  return (
    <section aria-labelledby={id}>
      <h4
        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        id={id}
      >
        {title}
      </h4>
      {children}
    </section>
  );
}

function AgentRunSteps({ run }: { run: AgentRunSummary }): ReactElement {
  return (
    <AgentRunDetailSection id={`agent-run-${run.id}-steps`} title="Steps">
      {run.steps?.length ? (
        <ol className="mt-2 space-y-2">
          {run.steps.map((step, index) => (
            <li
              className="border-l-2 border-border pl-3 text-sm"
              key={step.id ?? `${run.id}-step-${index}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  {step.label || `Step ${index + 1}`}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatRunStatus(step.status)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatRunDuration(step.durationMs)}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          No step timeline was recorded for this run.
        </p>
      )}
    </AgentRunDetailSection>
  );
}

function AgentRunToolCalls({ run }: { run: AgentRunSummary }): ReactElement {
  return (
    <AgentRunDetailSection
      id={`agent-run-${run.id}-tools`}
      title="Tool activity"
    >
      {run.toolCalls?.length ? (
        <ol className="mt-2 space-y-2">
          {run.toolCalls.map((toolCall, index) => (
            <li
              className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm"
              key={`${run.id}-tool-${toolCall.toolName ?? 'unknown'}-${index}`}
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {toolCall.toolName || 'Unknown tool'}
                </p>
                {toolCall.error ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-destructive">
                    {toolCall.error}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                <p>{formatRunStatus(toolCall.status)}</p>
                <p>{formatRunDuration(toolCall.durationMs)}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          This run did not record any tool activity.
        </p>
      )}
    </AgentRunDetailSection>
  );
}

function AgentRunDetailContent({
  actionRunId,
  detailError,
  onCancel,
  onOpenThread,
  onRetry,
  run,
}: Omit<AgentWorkspaceRunDetailProps, 'isLoading' | 'onReload'> & {
  run: AgentRunSummary;
}): ReactElement {
  return (
    <article aria-labelledby={`agent-run-${run.id}-title`} className="p-4">
      <AgentRunDetailError error={detailError} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <AgentRunDetailHeading run={run} />
        <div className="flex shrink-0 flex-wrap gap-2">
          <AgentRunThreadAction run={run} onOpenThread={onOpenThread} />
          <AgentRunCancelAction
            actionRunId={actionRunId}
            run={run}
            onCancel={onCancel}
          />
          <AgentRunRetryAction
            actionRunId={actionRunId}
            run={run}
            onRetry={onRetry}
          />
        </div>
      </div>

      <AgentRunProgress run={run} />
      <AgentRunFailure error={run.error} />
      <AgentRunProvenance run={run} />
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <AgentRunSteps run={run} />
        <AgentRunToolCalls run={run} />
      </div>
    </article>
  );
}

function AgentRunDetailError({
  error,
}: {
  error: string | null;
}): ReactElement | null {
  if (!error) {
    return null;
  }

  return (
    <div
      className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
      role="alert"
    >
      {error}
    </div>
  );
}

function AgentRunDetailHeading({
  run,
}: {
  run: AgentRunSummary;
}): ReactElement {
  return (
    <div className="min-w-0">
      <AgentRunStatusBadge status={run.status} />
      <h3
        className="mt-2 break-words text-base font-semibold text-foreground"
        id={`agent-run-${run.id}-title`}
      >
        {run.label || 'Untitled run'}
      </h3>
      {run.objective ? (
        <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
          {run.objective}
        </p>
      ) : null}
    </div>
  );
}

function AgentRunDetailUnavailable({
  detailError,
  onReload,
}: Pick<
  AgentWorkspaceRunDetailProps,
  'detailError' | 'onReload'
>): ReactElement {
  if (!detailError) {
    return (
      <div className="flex min-h-48 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Select a run to inspect its execution details.
      </div>
    );
  }

  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-4 text-center">
      <p className="text-sm text-destructive" role="alert">
        {detailError}
      </p>
      <Button
        size={ButtonSize.XS}
        variant={ButtonVariant.OUTLINE}
        withWrapper={false}
        onClick={onReload}
      >
        Retry detail
      </Button>
    </div>
  );
}

export function AgentWorkspaceRunDetail({
  actionRunId,
  detailError,
  isLoading,
  onCancel,
  onOpenThread,
  onReload,
  onRetry,
  run,
}: AgentWorkspaceRunDetailProps): ReactElement {
  if (isLoading) {
    return (
      <div className="flex min-h-48 items-center justify-center" role="status">
        <HiOutlineArrowPath
          aria-hidden="true"
          className="size-5 animate-spin text-primary"
        />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading run detail
        </span>
      </div>
    );
  }

  if (!run) {
    return (
      <AgentRunDetailUnavailable
        detailError={detailError}
        onReload={onReload}
      />
    );
  }

  return (
    <AgentRunDetailContent
      actionRunId={actionRunId}
      detailError={detailError}
      run={run}
      onCancel={onCancel}
      onOpenThread={onOpenThread}
      onRetry={onRetry}
    />
  );
}
