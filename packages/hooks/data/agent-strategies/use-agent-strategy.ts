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
    queryKey: ['agent-strategy', id],
    queryFn: async () => {
      if (!id) return null;
      const token = await resolveClerkToken(getToken);
      if (!token) return null;

      const service = AgentStrategiesService.getInstance(token);
      return service.getById(id);
    },
    enabled: !!id,
  });

  return {
    isLoading,
    refresh: async () => {
      await refetch();
    },
    strategy,
  };
}
