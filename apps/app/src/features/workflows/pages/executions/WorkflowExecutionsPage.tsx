'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonVariant, formatEnumLabel } from '@genfeedai/enums';
import {
  AuthenticationTokenUnavailableError,
  useAuthedService,
} from '@hooks/auth/use-authed-service/use-authed-service';
import {
  toBrandListParams,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import { Button } from '@ui/primitives/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useReducer } from 'react';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import type { ExecutionResult } from '@/features/workflows/services/workflow-api';
import { createWorkflowApiService } from '@/features/workflows/services/workflow-api';
import { getExecutionEtaDisplayState } from '@/features/workflows/utils/eta-display';
import {
  getStatusColor,
  getStatusIcon,
} from '@/features/workflows/utils/status-helpers';
import { catalogWorkflowLabels, getWorkflowLabel } from './get-workflow-label';

type ExecutionsState = {
  executions: ExecutionResult[];
  workflowLabels: Map<string, string>;
  isLoading: boolean;
  error: string | null;
  offset: number;
  hasMore: boolean;
};

type ExecutionsAction =
  | { type: 'FETCH_START' }
  | {
      type: 'FETCH_SUCCESS';
      executions: ExecutionResult[];
      hasMore: boolean;
      workflowLabels: Map<string, string>;
    }
  | { type: 'FETCH_ERROR'; error: string }
  | { type: 'SET_OFFSET'; offset: number };

const initialState: ExecutionsState = {
  executions: [],
  workflowLabels: new Map(),
  isLoading: true,
  error: null,
  offset: 0,
  hasMore: false,
};

function executionsReducer(
  state: ExecutionsState,
  action: ExecutionsAction,
): ExecutionsState {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, isLoading: true, error: null };
    case 'FETCH_SUCCESS':
      return {
        ...state,
        isLoading: false,
        executions: action.executions,
        hasMore: action.hasMore,
        workflowLabels: action.workflowLabels,
      };
    case 'FETCH_ERROR':
      return { ...state, isLoading: false, error: action.error };
    case 'SET_OFFSET':
      return { ...state, offset: action.offset };
    default:
      return state;
  }
}

const EXECUTIONS_PER_PAGE = 20;

/**
 * Execution History - List of workflow execution runs
 */
export default function WorkflowExecutionsPage() {
  const { href } = useOrgUrl();
  const translate = useTranslations('common.automation.workflows.executions');
  const { brandId, isReady, organizationId, pageScope } = useCollectionScope();
  const [state, dispatch] = useReducer(executionsReducer, initialState);
  const { executions, workflowLabels, isLoading, error, offset, hasMore } =
    state;

  const getService = useAuthedService(createWorkflowApiService);

  const loadExecutions = useCallback(
    async (signal: AbortSignal, pageOffset = 0) => {
      try {
        const service = await getService();
        if (signal.aborted) {
          return;
        }

        dispatch({ type: 'FETCH_START' });

        const brandParams = toBrandListParams({ brandId });
        const [data, workflows] = await Promise.all([
          service.listExecutions({
            ...brandParams,
            limit: EXECUTIONS_PER_PAGE,
            offset: pageOffset,
          }),
          service
            .list({ ...brandParams, limit: 100 })
            .catch((error: unknown) => {
              logger.error('Failed to load workflow labels for executions', {
                error,
              });
              return [];
            }),
        ]);
        if (signal.aborted) {
          return;
        }

        dispatch({
          type: 'FETCH_SUCCESS',
          executions: data,
          hasMore: data.length === EXECUTIONS_PER_PAGE,
          workflowLabels: catalogWorkflowLabels(workflows),
        });
      } catch (err) {
        if (signal.aborted) {
          return;
        }
        if (err instanceof AuthenticationTokenUnavailableError) {
          dispatch({
            type: 'FETCH_ERROR',
            error: 'Authentication token unavailable',
          });
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Failed to load executions';
        logger.error('Failed to load executions', { error: err });
        dispatch({ type: 'FETCH_ERROR', error: message });
      }
    },
    [brandId, getService],
  );

  useEffect(() => {
    if (!isReady || !organizationId) {
      return;
    }
    if (pageScope === 'brand' && !brandId) {
      return;
    }

    const controller = new AbortController();
    loadExecutions(controller.signal, offset);
    return () => controller.abort();
  }, [brandId, isReady, loadExecutions, offset, organizationId, pageScope]);

  if (isLoading && executions.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-7xl px-6 py-8">
          <div className="overflow-hidden border border-border">
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
                className="flex gap-8 border-t border-border px-4 py-3"
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
          variant={ButtonVariant.SECONDARY}
          onClick={() => {
            const controller = new AbortController();
            loadExecutions(controller.signal, offset);
          }}
        >
          {translate('retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <h1 className="sr-only">{translate('title')}</h1>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {executions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 text-6xl">📊</div>
            <h2 className="mb-2 text-xl font-semibold">
              {translate('emptyTitle')}
            </h2>
            <p className="mb-6 text-muted-foreground">
              {translate('emptyDescription')}
            </p>
            <Link
              href={href(APP_ROUTES.AUTOMATION.WORKFLOWS)}
              className=" bg-primary px-6 py-3 text-primary-foreground hover:bg-primary/90"
            >
              {translate('emptyAction')}
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-hidden border border-border">
              <Table className="w-full">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="px-4 py-3 text-left text-sm font-medium">
                      {translate('workflow')}
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-sm font-medium">
                      {translate('trigger')}
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-sm font-medium">
                      {translate('status')}
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-sm font-medium">
                      {translate('progress')}
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-sm font-medium">
                      {translate('started')}
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-sm font-medium">
                      {translate('duration')}
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-sm font-medium">
                      {translate('actions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border">
                  {executions.map((execution) => {
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
                        key={execution.id}
                        className="hover:bg-muted/30"
                      >
                        <TableCell className="px-4 py-3">
                          <Link
                            href={href(
                              `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${execution.workflowId}`,
                            )}
                            className="font-medium hover:text-primary"
                          >
                            {getWorkflowLabel(execution, workflowLabels)}
                          </Link>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                          {execution.trigger
                            ? formatEnumLabel(execution.trigger)
                            : '—'}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${getStatusColor(
                              execution.status,
                            )}`}
                          >
                            {getStatusIcon(execution.status)}{' '}
                            {formatEnumLabel(execution.status)}
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
                                className="h-full rounded-full bg-primary transition-[width]"
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
                          <ClientFormattedDate
                            value={execution.startedAt ?? execution.createdAt}
                          />
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm">
                          {etaDisplay.actualDurationLabel ??
                            (durationSec !== null ? `${durationSec}s` : ':')}
                          {etaDisplay.etaLabel && (
                            <div className="text-xs text-muted-foreground">
                              {etaDisplay.etaLabel}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <Link
                            href={href(
                              `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${execution.workflowId}?execution=${execution.id}`,
                            )}
                            className="text-sm text-primary hover:underline"
                          >
                            {translate('viewDetails')}
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
                variant={ButtonVariant.SECONDARY}
                disabled={offset === 0}
                onClick={() =>
                  dispatch({
                    type: 'SET_OFFSET',
                    offset: Math.max(0, offset - EXECUTIONS_PER_PAGE),
                  })
                }
              >
                {translate('previous')}
              </Button>
              <span className="text-sm text-muted-foreground">
                {translate('showing', {
                  from: offset + 1,
                  to: offset + executions.length,
                })}
              </span>
              <Button
                variant={ButtonVariant.SECONDARY}
                disabled={!hasMore}
                onClick={() =>
                  dispatch({
                    type: 'SET_OFFSET',
                    offset: offset + EXECUTIONS_PER_PAGE,
                  })
                }
              >
                {translate('next')}
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
