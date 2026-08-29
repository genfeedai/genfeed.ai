'use client';

import type { IAgentRun } from '@genfeedai/interfaces';
import { AgentRunsService } from '@genfeedai/services/ai/agent-runs.service';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useVisiblePolling } from '@hooks/ui/use-visible-polling/use-visible-polling';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

export interface UseActiveAgentRunsReturn {
  activeRuns: IAgentRun[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export interface UseActiveAgentRunsOptions {
  initialActiveRuns?: IAgentRun[];
  revalidateOnMount?: boolean;
}

/** How often a live run's progress is re-read while the tab is in front. */
const ACTIVE_RUNS_POLL_INTERVAL_MS = 5000;

/**
 * Hook for active agent runs with polling for live updates.
 * Polls every 5 seconds when there are active runs and the tab is visible.
 */
export function useActiveAgentRuns(
  options: UseActiveAgentRunsOptions = {},
): UseActiveAgentRunsReturn {
  const { getToken, orgId, userId } = useAuthIdentity();

  const shouldRevalidateOnMount =
    options.revalidateOnMount ?? options.initialActiveRuns == null;

  const {
    data: runs = [] as IAgentRun[],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['active-agent-runs', userId ?? 'anonymous', orgId ?? 'no-org'],
    queryFn: async () => {
      const token = await resolveAuthToken(getToken);
      if (!token) return [];

      const service = AgentRunsService.getInstance(token);
      return service.getActive();
    },
    initialData: options.initialActiveRuns ?? undefined,
    staleTime: shouldRevalidateOnMount ? 0 : Number.POSITIVE_INFINITY,
  });

  useVisiblePolling(
    useCallback(() => {
      void refetch();
    }, [refetch]),
    {
      intervalMs: ACTIVE_RUNS_POLL_INTERVAL_MS,
      isEnabled: runs.length > 0,
    },
  );

  return {
    activeRuns: runs,
    isLoading,
    refresh: async () => {
      await refetch();
    },
  };
}
