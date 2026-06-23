'use client';

import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import {
  AgentStrategiesService,
  type AgentStrategy,
} from '@genfeedai/services/automation/agent-strategies.service';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useQuery } from '@tanstack/react-query';

export interface UseAgentStrategyReturn {
  strategy: AgentStrategy | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useAgentStrategy(id: string): UseAgentStrategyReturn {
  const { getToken } = useAuthIdentity();

  const {
    data: strategy = null,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['agent-strategy', id],
    queryFn: async () => {
      if (!id) return null;
      const token = await resolveAuthToken(getToken);
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
