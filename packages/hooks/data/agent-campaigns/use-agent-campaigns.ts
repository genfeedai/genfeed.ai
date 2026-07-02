'use client';

import { useBrandId } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  type AgentCampaign,
  AgentCampaignsService,
} from '@genfeedai/services/automation/agent-campaigns.service';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
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
  const { getToken } = useAuthIdentity();
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
