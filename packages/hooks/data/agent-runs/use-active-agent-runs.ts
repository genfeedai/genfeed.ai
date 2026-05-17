'use client';

import { useAuth } from '@clerk/nextjs';
import type { IAgentRun } from '@genfeedai/interfaces';
import { AgentRunsService } from '@genfeedai/services/ai/agent-runs.service';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useQuery } from '@tanstack/react-query';

export interface UseActiveAgentRunsReturn {
  activeRuns: IAgentRun[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export interface UseActiveAgentRunsOptions {
  initialActiveRuns?: IAgentRun[];
  revalidateOnMount?: boolean;
}

export function useActiveAgentRuns(
  options: UseActiveAgentRunsOptions = {},
): UseActiveAgentRunsReturn {
  const { getToken, orgId, userId } = useAuth();

  const {
    data: activeRuns = [] as IAgentRun[],
    isLoading,
    refetch,
  } = useQuery({
    initialData: options.initialActiveRuns ?? undefined,
    initialDataUpdatedAt: options.initialActiveRuns ? 0 : undefined,
    queryFn: async () => {
      const token = await resolveClerkToken(getToken);
      if (!token) return [];

      const service = AgentRunsService.getInstance(token);
      return service.getActive();
    },
    queryKey: ['active-agent-runs', userId ?? 'anonymous', orgId ?? 'no-org'],
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && data.length > 0 ? 5000 : false;
    },
  });

  const refresh = async () => {
    await refetch();
  };

  return {
    activeRuns,
    isLoading,
    refresh,
  };
}
