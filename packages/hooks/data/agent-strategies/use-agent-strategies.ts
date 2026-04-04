'use client';

import { useAuth } from '@clerk/nextjs';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import {
  AgentStrategiesService,
  type AgentStrategy,
} from '@services/automation/agent-strategies.service';
import { useCallback } from 'react';

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

  const fetchStrategies = useCallback(async () => {
    const token = await resolveClerkToken(getToken);
    if (!token) return [];

    const service = AgentStrategiesService.getInstance(token);
    return service.list({
      agentType: options.agentType,
      isActive: options.isActive,
    });
  }, [getToken, options.agentType, options.isActive]);

  const {
    data: strategies,
    isLoading,
    refresh,
  } = useResource(fetchStrategies, {
    defaultValue: [] as AgentStrategy[],
    dependencies: [options.agentType, options.isActive],
  });

  return {
    isLoading,
    refresh,
    strategies,
  };
}
