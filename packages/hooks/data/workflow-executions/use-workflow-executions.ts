'use client';

import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import type {
  WorkflowExecutionListQueryParams,
  WorkflowExecutionStats,
} from '@genfeedai/contracts/types';
import { WorkflowExecutionsService } from '@genfeedai/services/automation/workflow-executions.service';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

export interface UseWorkflowExecutionsReturn {
  cancelExecution: (id: string) => Promise<void>;
  executions: IWorkflowExecution[];
  isLoading: boolean;
  isError: boolean;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
  stats: WorkflowExecutionStats;
}

export function useWorkflowExecutions(
  params: WorkflowExecutionListQueryParams = {},
): UseWorkflowExecutionsReturn {
  const { getToken, orgId, userId } = useAuthIdentity();
  const {
    data = [],
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: [
      'workflow-executions',
      userId ?? 'anonymous',
      orgId ?? 'no-org',
      params,
    ],
    queryFn: async () => {
      const token = await resolveAuthToken(getToken);
      if (!token) return [];
      return WorkflowExecutionsService.getInstance(token).list(params);
    },
    refetchInterval: (query) =>
      query.state.data?.some(
        (execution) =>
          execution.status === WorkflowExecutionStatus.PENDING ||
          execution.status === WorkflowExecutionStatus.RUNNING,
      )
        ? 5000
        : false,
  });

  const stats = useMemo<WorkflowExecutionStats>(() => {
    let active = 0;
    let completed = 0;
    let failed = 0;
    let totalCredits = 0;
    for (const execution of data) {
      if (
        execution.status === WorkflowExecutionStatus.PENDING ||
        execution.status === WorkflowExecutionStatus.RUNNING
      ) {
        active += 1;
      } else if (execution.status === WorkflowExecutionStatus.COMPLETED) {
        completed += 1;
      } else if (execution.status === WorkflowExecutionStatus.FAILED) {
        failed += 1;
      }
      totalCredits += execution.creditsUsed;
    }
    return { active, completed, failed, total: data.length, totalCredits };
  }, [data]);

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
    executions: data,
    isRefreshing: isFetching,
    isError,
    isLoading,
    refresh: async () => {
      await refetch();
    },
    stats,
  };
}
