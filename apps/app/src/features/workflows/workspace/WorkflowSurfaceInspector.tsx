'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiOutlineArrowPath,
  HiOutlineArrowTopRightOnSquare,
  HiOutlineCheck,
  HiOutlineClock,
  HiOutlineExclamationTriangle,
  HiOutlineShieldCheck,
  HiOutlineXMark,
} from 'react-icons/hi2';
import {
  type CloudWorkflowData,
  createWorkflowApiService,
  type ExecutionResult,
  type WorkflowInputVariable,
} from '@/features/workflows/services/workflow-api';
import {
  appendWorkflowThread,
  resolveWorkflowSurfaceRoute,
} from './workflow-surface-routing';

const ACTIVE_RUN_POLL_MS = 2500;
const TERMINAL_RUN_STATUSES = new Set(['cancelled', 'completed', 'failed']);

interface WorkflowAgentScopeMetadata {
  readonly brandId?: string;
  readonly contextVersion?: number;
  readonly source?: string;
  readonly threadId?: string;
}

interface WorkflowPendingApproval {
  readonly nodeId?: string;
  readonly requestedAt?: string;
  readonly timeoutHours?: number;
}

interface WorkflowLastApproval {
  readonly approved?: boolean;
  readonly approvedAt?: string;
  readonly approvedBy?: string;
  readonly nodeId?: string;
}

interface WorkflowInspectorMetadata extends Record<string, unknown> {
  readonly agentScope?: WorkflowAgentScopeMetadata;
  readonly lastApproval?: WorkflowLastApproval;
  readonly pendingApproval?: WorkflowPendingApproval | null;
  readonly source?: string;
}

interface WorkflowSurfaceInspectorProps {
  readonly contextVersion?: number;
  readonly pathname: string;
  readonly searchParams: URLSearchParams;
  readonly threadId: string | null;
}

function getWorkflowId(execution: ExecutionResult): string {
  return typeof execution.workflow === 'string'
    ? execution.workflow
    : execution.workflow._id;
}

function hasInputValue(value: unknown): boolean {
  return !(
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0)
  );
}

function describeRequiredInput(
  variable: WorkflowInputVariable,
  execution: ExecutionResult | null,
): string {
  const value = execution?.inputValues?.[variable.key];
  if (hasInputValue(value)) {
    return 'Provided for this run';
  }
  if (hasInputValue(variable.defaultValue)) {
    return 'Using saved default';
  }
  return variable.required ? 'Required before run' : 'Optional';
}

function formatTimestamp(value?: string): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

export function WorkflowSurfaceInspector({
  contextVersion,
  pathname,
  searchParams,
  threadId,
}: WorkflowSurfaceInspectorProps) {
  const selection = useMemo(
    () => resolveWorkflowSurfaceRoute(pathname, searchParams),
    [pathname, searchParams],
  );
  const [workflow, setWorkflow] = useState<CloudWorkflowData | null>(null);
  const [execution, setExecution] = useState<ExecutionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const getService = useAuthedService(createWorkflowApiService);
  const { push } = useRouter();

  useEffect(() => {
    void reloadKey;
    const controller = new AbortController();
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const load = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const service = await getService();
        if (controller.signal.aborted) {
          return;
        }

        const nextExecution = selection.executionId
          ? await service.getExecution(selection.executionId)
          : null;
        if (controller.signal.aborted) {
          return;
        }

        const nextWorkflowId =
          selection.workflowId ??
          (nextExecution ? getWorkflowId(nextExecution) : null);
        const nextWorkflow = nextWorkflowId
          ? await service.get(nextWorkflowId)
          : null;
        if (controller.signal.aborted) {
          return;
        }

        setExecution(nextExecution);
        setWorkflow(nextWorkflow);

        if (nextExecution && !TERMINAL_RUN_STATUSES.has(nextExecution.status)) {
          pollTimer = setTimeout(() => {
            setReloadKey((current) => current + 1);
          }, ACTIVE_RUN_POLL_MS);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          logger.error('Failed to load workflow inspector', {
            cause,
            executionId: selection.executionId,
            workflowId: selection.workflowId,
          });
          setError(
            cause instanceof Error
              ? cause.message
              : 'Failed to load workflow context',
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      controller.abort();
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
    };
  }, [getService, reloadKey, selection.executionId, selection.workflowId]);

  const metadata = (execution?.metadata ?? {}) as WorkflowInspectorMetadata;
  const pendingApproval = metadata.pendingApproval ?? null;
  const requiredInputs =
    workflow?.inputVariables?.filter((variable) => variable.required) ?? [];
  const workflowId =
    workflow?._id ??
    (execution ? getWorkflowId(execution) : selection.workflowId);
  const workflowHref =
    selection.workflowBaseHref && workflowId
      ? appendWorkflowThread(
          `${selection.workflowBaseHref}/${encodeURIComponent(workflowId)}${
            execution ? `?execution=${encodeURIComponent(execution._id)}` : ''
          }`,
          threadId,
        )
      : null;
  const executionHref =
    selection.workflowBaseHref && execution
      ? appendWorkflowThread(
          `${selection.workflowBaseHref}/executions/${encodeURIComponent(
            execution._id,
          )}`,
          threadId,
        )
      : null;

  const submitApproval = useCallback(
    async (approved: boolean): Promise<void> => {
      if (!workflowId || !execution || !pendingApproval?.nodeId) {
        return;
      }

      setIsSubmittingApproval(true);
      setError(null);
      try {
        const service = await getService();
        await service.submitApproval(
          workflowId,
          execution._id,
          pendingApproval.nodeId,
          approved,
          approved ? undefined : 'Rejected from workflow run inspector',
          threadId && contextVersion !== undefined
            ? { expectedContextVersion: contextVersion, threadId }
            : undefined,
        );
        setReloadKey((current) => current + 1);
      } catch (cause) {
        logger.error('Failed to submit workflow inspector approval', {
          approved,
          cause,
          executionId: execution._id,
          workflowId,
        });
        setError(
          cause instanceof Error
            ? cause.message
            : 'Failed to submit workflow approval',
        );
      } finally {
        setIsSubmittingApproval(false);
      }
    },
    [
      contextVersion,
      execution,
      getService,
      pendingApproval?.nodeId,
      threadId,
      workflowId,
    ],
  );

  const resumeExecution = useCallback(async (): Promise<void> => {
    if (!workflowId || !execution || !selection.workflowBaseHref) {
      return;
    }

    setIsResuming(true);
    setError(null);
    try {
      const service = await getService();
      const resumed = await service.resumeExecution(
        workflowId,
        execution._id,
        threadId && contextVersion !== undefined
          ? { expectedContextVersion: contextVersion, threadId }
          : undefined,
      );
      push(
        appendWorkflowThread(
          `${selection.workflowBaseHref}/executions/${encodeURIComponent(
            resumed.runId,
          )}`,
          threadId,
        ),
      );
    } catch (cause) {
      logger.error('Failed to resume workflow inspector execution', {
        cause,
        executionId: execution._id,
        workflowId,
      });
      setError(
        cause instanceof Error
          ? cause.message
          : 'Failed to resume workflow execution',
      );
    } finally {
      setIsResuming(false);
    }
  }, [
    contextVersion,
    execution,
    getService,
    push,
    selection.workflowBaseHref,
    threadId,
    workflowId,
  ]);

  if (!selection.workflowBaseHref) {
    return null;
  }

  if (!selection.workflowId && !selection.executionId) {
    return (
      <div className="gen-shell-empty-state p-4">
        <p className="text-sm font-medium text-foreground">Workflow library</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Select an authorized workflow to inspect its inputs, schedule, runs,
          provenance, and approvals.
        </p>
      </div>
    );
  }

  if (isLoading && !workflow && !execution) {
    return (
      <div
        aria-live="polite"
        className="animate-pulse p-4 text-sm text-muted-foreground"
      >
        Loading workflow context…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <div className="flex items-start gap-2">
            <HiOutlineExclamationTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
          <Button
            className="mt-3"
            icon={<HiOutlineArrowPath className="size-4" />}
            onClick={() => setReloadKey((current) => current + 1)}
            size={ButtonSize.SM}
            variant={ButtonVariant.OUTLINE}
            withWrapper={false}
          >
            Retry
          </Button>
        </div>
      ) : null}

      <section className="rounded-lg border border-border bg-background p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {workflow?.name ?? 'Workflow run'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Deterministic workflow engine
            </p>
          </div>
          {execution ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize text-foreground">
              {execution.status}
            </span>
          ) : null}
        </div>

        {execution ? (
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium text-foreground">
                {execution.progress}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{
                  width: `${Math.max(0, Math.min(100, execution.progress))}%`,
                }}
              />
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-border bg-background p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Required input
        </p>
        {requiredInputs.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No required inputs.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {requiredInputs.map((variable) => (
              <li className="text-xs" key={variable.key}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">
                    {variable.label}
                  </span>
                  <span className="text-right text-muted-foreground">
                    {describeRequiredInput(variable, execution)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border bg-background p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Provenance
        </p>
        <dl className="mt-2 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Trigger</dt>
            <dd className="capitalize text-foreground">
              {execution?.trigger ?? 'Not running'}
            </dd>
          </div>
          {metadata.source ? (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Source</dt>
              <dd className="text-right text-foreground">{metadata.source}</dd>
            </div>
          ) : null}
          {metadata.agentScope?.threadId ? (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Thread context</dt>
              <dd className="text-right text-foreground">
                v{metadata.agentScope.contextVersion ?? '—'} ·{' '}
                {metadata.agentScope.source ?? 'validated'}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="rounded-lg border border-border bg-background p-3">
        <div className="flex items-center gap-2">
          <HiOutlineShieldCheck className="size-4 text-muted-foreground" />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Approvals
          </p>
        </div>
        {pendingApproval?.nodeId ? (
          <div className="mt-3 space-y-3">
            <div className="rounded-md bg-warning/10 p-2 text-xs text-foreground">
              <p className="font-medium">Review required</p>
              <p className="mt-1 text-muted-foreground">
                Node {pendingApproval.nodeId}
                {formatTimestamp(pendingApproval.requestedAt)
                  ? ` · ${formatTimestamp(pendingApproval.requestedAt)}`
                  : ''}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                disabled={isSubmittingApproval}
                icon={<HiOutlineCheck className="size-4" />}
                onClick={() => void submitApproval(true)}
                size={ButtonSize.SM}
                variant={ButtonVariant.DEFAULT}
                withWrapper={false}
              >
                Approve
              </Button>
              <Button
                disabled={isSubmittingApproval}
                icon={<HiOutlineXMark className="size-4" />}
                onClick={() => void submitApproval(false)}
                size={ButtonSize.SM}
                variant={ButtonVariant.OUTLINE}
                withWrapper={false}
              >
                Reject
              </Button>
            </div>
          </div>
        ) : metadata.lastApproval ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Last decision:{' '}
            {metadata.lastApproval.approved ? 'approved' : 'rejected'}
            {formatTimestamp(metadata.lastApproval.approvedAt)
              ? ` · ${formatTimestamp(metadata.lastApproval.approvedAt)}`
              : ''}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            No approval is currently required.
          </p>
        )}
      </section>

      {workflow?.schedule ? (
        <section className="rounded-lg border border-border bg-background p-3">
          <div className="flex items-center gap-2">
            <HiOutlineClock className="size-4 text-muted-foreground" />
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Schedule
            </p>
          </div>
          <p className="mt-2 text-xs text-foreground">
            {workflow.isScheduleEnabled ? 'Enabled' : 'Disabled'} ·{' '}
            {workflow.schedule} · {workflow.timezone ?? 'UTC'}
          </p>
        </section>
      ) : null}

      <div className="space-y-2">
        {execution?.status === 'failed' ? (
          <Button
            disabled={isResuming}
            icon={<HiOutlineArrowPath className="size-4" />}
            onClick={() => void resumeExecution()}
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
          >
            Resume failed run
          </Button>
        ) : null}
        {workflowHref ? (
          <Button asChild variant={ButtonVariant.OUTLINE} withWrapper={false}>
            <Link href={workflowHref}>
              <HiOutlineArrowTopRightOnSquare className="size-4" />
              Open workflow editor
            </Link>
          </Button>
        ) : null}
        {executionHref ? (
          <Button asChild variant={ButtonVariant.GHOST} withWrapper={false}>
            <Link href={executionHref}>Inspect canonical run</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
