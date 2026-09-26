'use client';

import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import type {
  WorkflowExecutionListQueryParams,
  WorkflowExecutionStats,
} from '@genfeedai/contracts/types';
import { getLocalDayWindow } from '@genfeedai/helpers';
import { WorkflowExecutionsService } from '@genfeedai/services/automation/workflow-executions.service';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { logger } from '@services/core/logger.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

export interface UseWorkflowExecutionsOptions {
  enabled?: boolean;
  organizationId?: string;
}

export interface UseWorkflowExecutionsReturn {
  cancelExecution: (id: string) => Promise<void>;
  executions: IWorkflowExecution[];
  isLoading: boolean;
  isError: boolean;
  isRefreshing: boolean;
  /** True when the last statistics request failed or returned garbage and
   * `stats` is a fallback (previous cache, or zeros with a derived `active`)
   * rather than a fresh summary. */
  isStatsDegraded: boolean;
  refresh: () => Promise<void>;
  stats: WorkflowExecutionStats;
}

interface WorkflowExecutionsQueryData {
  executions: IWorkflowExecution[];
  isStatsDegraded: boolean;
  stats: WorkflowExecutionStats;
}

const EMPTY_STATS: WorkflowExecutionStats = {
  active: 0,
  completed: 0,
  completedToday: 0,
  failed: 0,
  failedToday: 0,
  total: 0,
  totalCredits: 0,
};
const EMPTY_EXECUTIONS: IWorkflowExecution[] = [];

function readStat(value: object, field: string): number {
  if (!Object.hasOwn(value, field)) return 0;
  const amount = Reflect.get(value, field);
  return typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
}

/** Collection responses are not summaries. Keep history mounted with zeros. */
function coerceExecutionStats(value: unknown): WorkflowExecutionStats {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return EMPTY_STATS;
  }
  return {
    active: readStat(value, 'active'),
    completed: readStat(value, 'completed'),
    completedToday: readStat(value, 'completedToday'),
    failed: readStat(value, 'failed'),
    failedToday: readStat(value, 'failedToday'),
    total: readStat(value, 'total'),
    totalCredits: readStat(value, 'totalCredits'),
  };
}

/** Ground truth for `stats.active` when the statistics summary is unavailable:
 * count the currently-fetched execution list directly, so a degraded stats
 * response never freezes `refetchInterval` while a run is still in flight. */
function countActiveExecutions(executions: IWorkflowExecution[]): number {
  return executions.reduce(
    (count, execution) =>
      execution.status === WorkflowExecutionStatus.PENDING ||
      execution.status === WorkflowExecutionStatus.RUNNING
        ? count + 1
        : count,
    0,
  );
}

export function useWorkflowExecutions(
  params: WorkflowExecutionListQueryParams = {},
  options: UseWorkflowExecutionsOptions = {},
): UseWorkflowExecutionsReturn {
  const [dayWindow, setDayWindow] = useState(() => getLocalDayWindow());
  useEffect(() => {
    const timer = setTimeout(
      () => setDayWindow(getLocalDayWindow()),
      Math.max(1, new Date(dayWindow.dayEnd).getTime() - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [dayWindow]);
  const { getToken, isLoaded, orgId, userId } = useAuthIdentity();
  // orgId stays null until the organization plugin lands; key on the session.
  const isIdentityReady = isLoaded && Boolean(userId);
  const isScopeReady =
    options.organizationId === undefined || Boolean(options.organizationId);
  const isEnabled =
    isIdentityReady && isScopeReady && (options.enabled ?? true);
  const queryClient = useQueryClient();
  const queryKey = [
    'workflow-executions',
    userId ?? 'anonymous',
    options.organizationId ?? orgId ?? 'no-org',
    params,
    dayWindow,
  ];
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    // Wait for identity so the first paint never shows an empty "0" strip.
    enabled: isEnabled,
    queryKey,
    queryFn: async () => {
      const token = await resolveAuthToken(getToken);
      if (!token)
        throw new Error('Authentication is required to load workflow activity');
      const service = WorkflowExecutionsService.getInstance(token);
      const { limit: _limit, offset: _offset, sort: _sort, ...scope } = params;
      // Stats and the execution list are fetched independently: a stats
      // failure (a 400 from the 26-hour window check, a transient 5xx, or an
      // older API during rollout) must not drop the execution list.
      const [executionsResult, statsResult] = await Promise.allSettled([
        service.list(params),
        service.getStats({ ...scope, ...dayWindow }),
      ]);
      if (executionsResult.status === 'rejected') {
        throw executionsResult.reason;
      }
      const executions = executionsResult.value;
      if (statsResult.status === 'fulfilled') {
        return {
          executions,
          isStatsDegraded: false,
          stats: coerceExecutionStats(statsResult.value),
        };
      }
      // A rejected stats call must not reset `active` to 0: that stops
      // `refetchInterval` below from ever polling again while a run is
      // still PENDING/RUNNING. Fall back to the previously cached summary
      // (if any) and always recompute `active` from the execution list
      // that was just fetched successfully, since it is ground truth.
      logger.warn(
        'Workflow execution stats request failed; keeping executions with degraded stats',
        {
          error: statsResult.reason,
        },
      );
      const previous =
        queryClient.getQueryData<WorkflowExecutionsQueryData>(queryKey);
      const fallbackStats = previous?.stats ?? EMPTY_STATS;
      return {
        executions,
        isStatsDegraded: true,
        stats: {
          ...fallbackStats,
          active: countActiveExecutions(executions),
        },
      };
    },
    // `stats` is coerced above before it is cached, so a null/degraded
    // response can never make this throw and stop polling.
    refetchInterval: (query) => (query.state.data?.stats.active ? 5000 : false),
  });

  const cancelExecution = useCallback(
    async (id: string) => {
      const token = await resolveAuthToken(getToken);
      if (!token) return;
      await WorkflowExecutionsService.getInstance(token).cancel(id);
      await refetch();
    },
    [getToken, refetch],
  );

  return {
    cancelExecution,
    executions: data?.executions ?? EMPTY_EXECUTIONS,
    isRefreshing: isFetching && !isPending,
    isError,
    isLoading: options.enabled !== false && isPending,
    isStatsDegraded: data?.isStatsDegraded ?? false,
    refresh: async () => {
      await refetch();
    },
    // Cached stats are already coerced in queryFn; no need to re-coerce here.
    stats: data?.stats ?? EMPTY_STATS,
  };
}
