'use client';

import { useAuth } from '@clerk/nextjs';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import {
  AgentStrategiesService,
  type AgentStrategy,
} from '@services/automation/agent-strategies.service';
import { useCallback } from 'react';

export interface UseAgentStrategyReturn {
  strategy: AgentStrategy | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useAgentStrategy(id: string): UseAgentStrategyReturn {
  const { getToken } = useAuth();

  const fetchStrategy = useCallback(async () => {
    if (!id) return null;
    const token = await resolveClerkToken(getToken);
    if (!token) return null;

    const service = AgentStrategiesService.getInstance(token);
    return service.getById(id);
  }, [getToken, id]);

  const {
    data: strategy,
    isLoading,
    refresh,
  } = useResource(fetchStrategy, {
    dependencies: [id],
  });

  return {
    isLoading,
    refresh,
    strategy,
  };
}
