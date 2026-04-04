'use client';

import { useAuth } from '@clerk/nextjs';
import type { IAgentRun } from '@cloud/interfaces';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { AgentRunsService } from '@services/ai/agent-runs.service';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  const { getToken } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activeRuns, setActiveRuns] = useState<IAgentRun[]>(
    options.initialActiveRuns ?? [],
  );

  const fetchActive = useCallback(
    async (_signal: AbortSignal) => {
      const token = await resolveClerkToken(getToken);
      if (!token) return [];

      const service = AgentRunsService.getInstance(token);
      return service.getActive();
    },
    [getToken],
  );

  const {
    data: runs,
    isLoading,
    refresh,
  } = useResource(fetchActive, {
    defaultValue: [] as IAgentRun[],
    initialData: options.initialActiveRuns ?? undefined,
    revalidateOnMount:
      options.revalidateOnMount ?? options.initialActiveRuns == null,
  });

  // Update local state when runs change
  useEffect(() => {
    setActiveRuns(runs);
  }, [runs]);

  // Poll when there are active runs
  useEffect(() => {
    if (activeRuns.length > 0) {
      intervalRef.current = setInterval(() => {
        refresh();
      }, 5000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeRuns.length, refresh]);

  return {
    activeRuns,
    isLoading,
    refresh,
  };
}
