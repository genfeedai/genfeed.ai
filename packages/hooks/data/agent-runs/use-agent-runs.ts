'use client';

import { useAuth } from '@clerk/nextjs';
import type { IAgentRun } from '@genfeedai/interfaces';
import type {
  AgentRunListQueryParams,
  AgentRunStats,
  AgentRunTimeRange,
} from '@genfeedai/types';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { AgentRunsService } from '@services/ai/agent-runs.service';
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

  const fetchRuns = useCallback(
    async (_signal: AbortSignal) => {
      const token = await resolveClerkToken(getToken);
      if (!token) return [];

      const service = AgentRunsService.getInstance(token);

      // Fetch runs and stats in parallel
      const [runs, fetchedStats] = await Promise.all([
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
      return runs;
    },
    [
      getToken,
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
  );

  const {
    data: runs,
    isLoading,
    refresh,
  } = useResource(fetchRuns, {
    defaultValue: [] as IAgentRun[],
    dependencies: [
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
    initialData: options.initialRuns ?? undefined,
    revalidateOnMount: options.revalidateOnMount ?? options.initialRuns == null,
  });

  const cancelRun = useCallback(
    async (id: string) => {
      const token = await resolveClerkToken(getToken);
      if (!token) return;

      const service = AgentRunsService.getInstance(token);
      await service.cancel(id);
      await refresh();
    },
    [getToken, refresh],
  );

  return {
    cancelRun,
    isLoading,
    refresh,
    runs,
    stats,
  };
}
