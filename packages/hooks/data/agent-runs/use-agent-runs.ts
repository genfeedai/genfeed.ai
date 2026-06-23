'use client';

import type { IAgentRun } from '@genfeedai/interfaces';
import { AgentRunsService } from '@genfeedai/services/ai/agent-runs.service';
import type {
  AgentRunListQueryParams,
  AgentRunStats,
  AgentRunTimeRange,
} from '@genfeedai/types';
import { resolveAuthToken } from '@helpers/auth/clerk.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

export interface UseAgentRunsOptions extends AgentRunListQueryParams {
  initialRuns?: IAgentRun[];
  initialStats?: AgentRunStats | null;
  revalidateOnMount?: boolean;
  timeRange?: AgentRunTimeRange;
}

export interface UseAgentRunsReturn {
  runs: IAgentRun[];
  stats: AgentRunStats | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  cancelRun: (id: string) => Promise<void>;
}

export function useAgentRuns(
  options: UseAgentRunsOptions = {},
): UseAgentRunsReturn {
  const { getToken, orgId, userId } = useAuthIdentity();
  const [stats, setStats] = useState<AgentRunStats | null>(
    options.initialStats ?? null,
  );

  const shouldRevalidateOnMount =
    options.revalidateOnMount ?? options.initialRuns == null;

  const {
    data: runs = [] as IAgentRun[],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: [
      'agent-runs',
      userId ?? 'anonymous',
      orgId ?? 'no-org',
      options.historyOnly,
      options.model,
      options.page,
      options.q,
      options.routingPolicy,
      options.sortMode,
      options.status,
      options.strategy,
      options.timeRange,
      options.trigger,
      options.webSearchEnabled,
    ],
    queryFn: async () => {
      const token = await resolveAuthToken(getToken);
      if (!token) return [];

      const service = AgentRunsService.getInstance(token);

      const [fetchedRuns, fetchedStats] = await Promise.all([
        service.list({
          historyOnly: options.historyOnly,
          model: options.model,
          page: options.page,
          q: options.q,
          routingPolicy: options.routingPolicy,
          sortMode: options.sortMode,
          status: options.status,
          strategy: options.strategy,
          trigger: options.trigger,
          webSearchEnabled: options.webSearchEnabled,
        }),
        service.getStats({ timeRange: options.timeRange }),
      ]);

      setStats(fetchedStats);
      return fetchedRuns;
    },
    initialData: options.initialRuns ?? undefined,
    staleTime: shouldRevalidateOnMount ? 0 : Number.POSITIVE_INFINITY,
  });

  const cancelRun = useCallback(
    async (id: string) => {
      const token = await resolveAuthToken(getToken);
      if (!token) return;

      const service = AgentRunsService.getInstance(token);
      await service.cancel(id);
      await refetch();
    },
    [getToken, refetch],
  );

  return {
    cancelRun,
    isLoading,
    refresh: async () => {
      await refetch();
    },
    runs,
    stats,
  };
}
