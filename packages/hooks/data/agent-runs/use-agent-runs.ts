'use client';

import { useAuth } from '@clerk/nextjs';
import type { IAgentRun } from '@genfeedai/interfaces';
import { AgentRunsService } from '@genfeedai/services/ai/agent-runs.service';
import type {
  AgentRunListQueryParams,
  AgentRunStats,
  AgentRunTimeRange,
} from '@genfeedai/types';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
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
  const { getToken } = useAuth();
  const [stats, setStats] = useState<AgentRunStats | null>(
    options.initialStats ?? null,
  );

  const {
    data: runs = [] as IAgentRun[],
    isLoading,
    refetch,
  } = useQuery({
    initialData: options.initialRuns ?? undefined,
    initialDataUpdatedAt: options.initialRuns ? 0 : undefined,
    queryFn: async () => {
      const token = await resolveClerkToken(getToken);
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
    queryKey: [
      'agent-runs',
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
  });

  const refresh = async () => {
    await refetch();
  };

  const cancelRun = useCallback(
    async (id: string) => {
      const token = await resolveClerkToken(getToken);
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
    refresh,
    runs,
    stats,
  };
}
