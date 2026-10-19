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
  /** Page size; only meaningful together with `page`. */
  limit?: number;
  /** When set, fetch only this server page. Omit to load every campaign. */
  page?: number;
  status?: string;
}

export interface UseAgentCampaignsReturn {
  campaigns: AgentCampaign[];
  /** The last list request's failure; `null` once a request succeeds. */
  error: Error | null;
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
    error,
    isLoading,
    refetch,
  } = useQuery({
    enabled: isEnabled,
    queryKey: [
      'agent-campaigns',
      brandId ?? null,
      pageScope,
      options.status,
      options.page,
      options.limit,
    ],
    queryFn: async () => {
      const token = await resolveAuthToken(getToken);
      if (!token) return [];

      const service = AgentCampaignsService.getInstance(token);
      return service.list({
        ...toBrandListParams({ brandId }),
        status: options.status,
        ...(options.page ? { limit: options.limit, page: options.page } : {}),
      });
    },
  });

  return {
    campaigns,
    error: isEnabled ? error : null,
    isLoading: !isEnabled || isLoading,
    refresh: async () => {
      if (!isEnabled) {
        return;
      }
      await refetch();
    },
  };
}
