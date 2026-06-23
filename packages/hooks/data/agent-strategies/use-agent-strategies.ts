'use client';

import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import {
  AgentStrategiesService,
  type AgentStrategy,
} from '@genfeedai/services/automation/agent-strategies.service';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useQuery } from '@tanstack/react-query';

export interface UseAgentStrategiesOptions {
  agentType?: string;
  isActive?: boolean;
}

export interface UseAgentStrategiesReturn {
  strategies: AgentStrategy[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useAgentStrategies(
  options: UseAgentStrategiesOptions = {},
): UseAgentStrategiesReturn {
  const { getToken } = useAuthIdentity();

  const {
    data: strategies = [] as AgentStrategy[],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['agent-strategies', options.agentType, options.isActive],
    queryFn: async () => {
      const token = await resolveAuthToken(getToken);
      if (!token) return [];

      const service = AgentStrategiesService.getInstance(token);
      return service.list({
        agentType: options.agentType,
        isActive: options.isActive,
      });
    },
  });

  return {
    isLoading,
    refresh: async () => {
      await refetch();
    },
    strategies,
  };
}
