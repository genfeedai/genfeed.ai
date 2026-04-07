'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import Button from '@ui/buttons/base/Button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { ExecutionResult } from '@/features/workflows/services/workflow-api';
import { createWorkflowApiService } from '@/features/workflows/services/workflow-api';
import { getExecutionEtaDisplayState } from '@/features/workflows/utils/eta-display';
import {
  getStatusColor,
  getStatusIcon,
} from '@/features/workflows/utils/status-helpers';

const EXECUTIONS_PER_PAGE = 20;

/**
 * Execution History - List of workflow execution runs
 */
export default function WorkflowExecutionsPage() {
  const { href } = useOrgUrl();
  const [executions, setExecutions] = useState<ExecutionResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const getService = useAuthedService(createWorkflowApiService);

  const loadExecutions = useCallback(
    async (signal: AbortSignal, pageOffset = 0) => {
      setIsLoading(true);
      setError(null);

      try {
        const service = await getService();
        if (signal.aborted) {
          return;
        }

        const data = await service.listExecutions({
          limit: EXECUTIONS_PER_PAGE,
          offset: pageOffset,
        });
        if (signal.aborted) {
          return;
        }

        setExecutions(data);
        setHasMore(data.length === EXECUTIONS_PER_PAGE);
      } catch (err) {
        if (signal.aborted) {
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Failed to load executions';
        logger.error('Failed to load executions', { error: err });
        setError(message);
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [getService],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadExecutions(controller.signal, offset);
    return () => controller.abort();
  }, [loadExecutions, offset]);

  const getWorkflowLabel = (workflow: ExecutionResult['workflow']): string => {
    if (typeof workflow === 'object' && workflow.label) {
      return workflow.label;
    }
    const id = typeof workflow === 'string' ? workflow : workflow._id;
    return `${id.slice(0, 8)}...`;
  };

  const getWorkflowId = (workflow: ExecutionResult['workflow']): string => {
    return typeof workflow === 'string' ? workflow : workflow._id;
  };

  if (isLoading && executions.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-white/[0.08] bg-card px-6 py-4">
          <div className="mx-auto max-w-7xl">
            <div className="h-7 w-48 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-4 w-72 animate-pulse rounded bg-muted" />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-8">
          <div className="overflow-hidden border border-white/[0.08]">
            <div className="bg-muted/50 px-4 py-3 flex gap-8">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-4 w-20 animate-pulse rounded bg-muted"
                />
              ))}
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex gap-8 border-t border-white/[0.08] px-4 py-3"
              >
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-4 w-16 animate-pulse rounded-full bg-muted" />
                <div className="h-2 w-16 animate-pulse rounded-full bg-muted self-center" />
                <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                <div className="h-4 w-12 animate-pulse rounded bg-muted" />
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error}</p>
        <Button
          variant={ButtonVariant.OUTLINE}
          onClick={() => {
            const controller = new AbortController();
            loadExecutions(controller.signal, offset);
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-white/[0.08] bg-card px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Execution History</h1>
            <p className="text-sm text-muted-foreground">
              View past workflow executions and their results
            </p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {executions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 text-6xl">📊</div>
            <h2 className="mb-2 text-xl font-semibold">No executions yet</h2>
            <p className="mb-6 text-muted-foreground">
              Run a workflow to see execution history here
            </p>
            <Link
              href={href('/workflows')}
              className=" bg-primary px-6 py-3 text-primary-foreground hover:bg-primary/90"
            >
              Go to Automations
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-hidden border border-white/[0.08]">
              <Table className="w-full">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="px-4 py-3 text-left text-sm font-medium">
                      Workflow
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-sm font-medium">
                      Status
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-sm font-medium">
                      Progress
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-sm font-medium">
                      Started
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-sm font-medium">
                      Duration
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-sm font-medium">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border">
                  {executions.map((execution) => {
                    const startedAt = execution.startedAt
                      ? new Date(execution.startedAt)
                      : null;
                    const durationSec = execution.durationMs
                      ? Math.round(execution.durationMs / 1000)
                      : null;
                    const etaDisplay = getExecutionEtaDisplayState({
                      durationMs: execution.durationMs,
                      eta: execution.metadata?.eta,
                      status: execution.status,
                    });

                    return (
                      <TableRow
                        key={execution._id}
                        className="hover:bg-muted/30"
                      >
                        <TableCell className="px-4 py-3">
                          <Link
                            href={href(
                              `/workflows/${getWorkflowId(execution.workflow)}`,
                            )}
                            className="font-medium hover:text-primary"
                          >
                            {getWorkflowLabel(execution.workflow)}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {execution._id.slice(0, 8)}...
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${getStatusColor(
                              execution.status,
                            )}`}
                          >
                            {getStatusIcon(execution.status)} {execution.status}
                          </span>
                          {etaDisplay.phaseLabel && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {etaDisplay.phaseLabel}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-16 rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{
                                  width: `${execution.progress}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {execution.progress}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm">
                          {startedAt
                            ? startedAt.toLocaleString()
                            : new Date(execution.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm">
                          {etaDisplay.actualDurationLabel ??
                            (durationSec !== null ? `${durationSec}s` : '—')}
                          {etaDisplay.etaLabel && (
                            <div className="text-xs text-muted-foreground">
                              {etaDisplay.etaLabel}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <Link
                            href={href(
                              `/workflows/${getWorkflowId(execution.workflow)}?execution=${execution._id}`,
                            )}
                            className="text-sm text-primary hover:underline"
                          >
                            View Details
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant={ButtonVariant.OUTLINE}
                isDisabled={offset === 0}
                onClick={() =>
                  setOffset((prev) => Math.max(0, prev - EXECUTIONS_PER_PAGE))
                }
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Showing {offset + 1}–{offset + executions.length}
              </span>
              <Button
                variant={ButtonVariant.OUTLINE}
                isDisabled={!hasMore}
                onClick={() => setOffset((prev) => prev + EXECUTIONS_PER_PAGE)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
