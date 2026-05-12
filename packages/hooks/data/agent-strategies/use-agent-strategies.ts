'use client';

import { useAuth } from '@clerk/nextjs';
import {
  AgentStrategiesService,
  type AgentStrategy,
} from '@genfeedai/services/automation/agent-strategies.service';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
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
  const { getToken } = useAuth();

  const {
    data: strategies = [] as AgentStrategy[],
    isLoading,
    refetch,
  } = useQuery({
    queryFn: async () => {
      const token = await resolveClerkToken(getToken);
      if (!token) return [];

      const service = AgentStrategiesService.getInstance(token);
      return service.list({
        agentType: options.agentType,
        isActive: options.isActive,
      });
    },
    queryKey: ['agent-strategies', options.agentType, options.isActive],
  });

  const refresh = async () => {
    await refetch();
  };

  return {
    isLoading,
    refresh,
    strategies,
  };
}
