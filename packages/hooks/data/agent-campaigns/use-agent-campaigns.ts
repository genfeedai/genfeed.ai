'use client';

import { useAuth } from '@clerk/nextjs';
import { useBrandId } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  type AgentCampaign,
  AgentCampaignsService,
} from '@genfeedai/services/automation/agent-campaigns.service';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { useCallback } from 'react';

export interface UseAgentCampaignsOptions {
  status?: string;
}

export interface UseAgentCampaignsReturn {
  campaigns: AgentCampaign[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useAgentCampaigns(
  options: UseAgentCampaignsOptions = {},
): UseAgentCampaignsReturn {
  const { getToken } = useAuth();
  const brandId = useBrandId();

  const fetchCampaigns = useCallback(async () => {
    const token = await resolveClerkToken(getToken);
    if (!token) return [];

    const service = AgentCampaignsService.getInstance(token);
    return service.list({
      status: options.status,
    });
  }, [getToken, options.status]);

  const {
    data: campaigns,
    isLoading,
    refresh,
  } = useResource(fetchCampaigns, {
    defaultValue: [] as AgentCampaign[],
    dependencies: [brandId, options.status],
  });

  return {
    campaigns,
    isLoading,
    refresh,
  };
}
