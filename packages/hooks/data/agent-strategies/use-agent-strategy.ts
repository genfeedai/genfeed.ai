'use client';

import { useAuth } from '@clerk/nextjs';
import {
  AgentStrategiesService,
  type AgentStrategy,
} from '@genfeedai/services/automation/agent-strategies.service';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useQuery } from '@tanstack/react-query';

export interface UseAgentStrategyReturn {
  strategy: AgentStrategy | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useAgentStrategy(id: string): UseAgentStrategyReturn {
  const { getToken } = useAuth();

  const {
    data: strategy = null,
    isLoading,
    refetch,
  } = useQuery({
    enabled: !!id,
    queryFn: async () => {
      const token = await resolveClerkToken(getToken);
      if (!token) return null;

      const service = AgentStrategiesService.getInstance(token);
      return service.getById(id);
    },
    queryKey: ['agent-strategy', id],
  });

  const refresh = async () => {
    await refetch();
  };

  return {
    isLoading,
    refresh,
    strategy,
  };
}
