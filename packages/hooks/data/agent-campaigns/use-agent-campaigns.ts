'use client';

import {
  type AgentCampaign,
  AgentCampaignsService,
} from '@genfeedai/services/automation/agent-campaigns.service';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import {
  isCollectionFetchReady,
  toBrandListParams,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
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
  const { brandId, isReady, organizationId, pageScope } = useCollectionScope();
  const isEnabled = isCollectionFetchReady({
    brandId,
    isReady,
    organizationId,
    pageScope,
  });

  const {
    data: campaigns = [] as AgentCampaign[],
    isLoading,
    refetch,
  } = useQuery({
    enabled: isEnabled,
    queryKey: ['agent-campaigns', brandId ?? null, pageScope, options.status],
    queryFn: async () => {
      const token = await resolveAuthToken(getToken);
      if (!token) return [];

      const service = AgentCampaignsService.getInstance(token);
      return service.list({
        ...toBrandListParams({ brandId }),
        status: options.status,
      });
    },
  });

  return {
    campaigns,
    isLoading: !isEnabled || isLoading,
    refresh: async () => {
      if (!isEnabled) {
        return;
      }
      await refetch();
    },
  };
}
