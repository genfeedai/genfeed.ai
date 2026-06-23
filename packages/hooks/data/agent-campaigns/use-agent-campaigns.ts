'use client';

import { useAuth } from '@clerk/nextjs';
import { useBrandId } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  type AgentCampaign,
  AgentCampaignsService,
} from '@genfeedai/services/automation/agent-campaigns.service';
import { resolveAuthToken } from '@helpers/auth/clerk.helper';
import { useQuery } from '@tanstack/react-query';

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

  const {
    data: campaigns = [] as AgentCampaign[],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['agent-campaigns', brandId, options.status],
    queryFn: async () => {
      const token = await resolveAuthToken(getToken);
      if (!token) return [];

      const service = AgentCampaignsService.getInstance(token);
      return service.list({
        status: options.status,
      });
    },
  });

  return {
    campaigns,
    isLoading,
    refresh: async () => {
      await refetch();
    },
  };
}
