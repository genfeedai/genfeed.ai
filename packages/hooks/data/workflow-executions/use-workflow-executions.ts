'use client';

import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import type {
  WorkflowExecutionListQueryParams,
  WorkflowExecutionStats,
} from '@genfeedai/contracts/types';
import { getLocalDayWindow } from '@genfeedai/helpers';
import { WorkflowExecutionsService } from '@genfeedai/services/automation/workflow-executions.service';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useQuery } from '@tanstack/react-query';
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
  refresh: () => Promise<void>;
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
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    // Wait for identity so the first paint never shows an empty "0" strip.
    enabled: isEnabled,
    queryKey: [
      'workflow-executions',
      userId ?? 'anonymous',
      options.organizationId ?? orgId ?? 'no-org',
      params,
      dayWindow,
    ],
    queryFn: async () => {
      const token = await resolveAuthToken(getToken);
      if (!token)
        throw new Error('Authentication is required to load workflow activity');
      const service = WorkflowExecutionsService.getInstance(token);
      const { limit: _limit, offset: _offset, sort: _sort, ...scope } = params;
      const [executions, stats] = await Promise.all([
        service.list(params),
        service.getStats({ ...scope, ...dayWindow }),
      ]);
      return { executions, stats };
    },
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
    refresh: async () => {
      await refetch();
    },
    stats: data?.stats ?? EMPTY_STATS,
  };
}
