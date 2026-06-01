'use client';

import { useAuth } from '@clerk/nextjs';
import type { IAgentRun } from '@genfeedai/interfaces';
import { AgentRunsService } from '@genfeedai/services/ai/agent-runs.service';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

export interface UseActiveAgentRunsReturn {
  activeRuns: IAgentRun[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export interface UseActiveAgentRunsOptions {
  initialActiveRuns?: IAgentRun[];
  revalidateOnMount?: boolean;
}

/**
 * Hook for active agent runs with polling for live updates.
 * Polls every 5 seconds when there are active runs.
 */
export function useActiveAgentRuns(
  options: UseActiveAgentRunsOptions = {},
): UseActiveAgentRunsReturn {
  const { getToken, orgId, userId } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activeRuns, setActiveRuns] = useState<IAgentRun[]>(
    options.initialActiveRuns ?? [],
  );

  const shouldRevalidateOnMount =
    options.revalidateOnMount ?? options.initialActiveRuns == null;

  const {
    data: runs = [] as IAgentRun[],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['active-agent-runs', userId ?? 'anonymous', orgId ?? 'no-org'],
    queryFn: async () => {
      const token = await resolveClerkToken(getToken);
      if (!token) return [];

      const service = AgentRunsService.getInstance(token);
      return service.getActive();
    },
    initialData: options.initialActiveRuns ?? undefined,
    staleTime: shouldRevalidateOnMount ? 0 : Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    setActiveRuns(runs);
  }, [runs]);

  useEffect(() => {
    if (activeRuns.length > 0) {
      intervalRef.current = setInterval(() => {
        void refetch();
      }, 5000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeRuns.length, refetch]);

  return {
    activeRuns,
    isLoading,
    refresh: async () => {
      await refetch();
    },
  };
}
