'use client';

import type { ICampaignPerformance } from '@genfeedai/contracts/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import {
  isCollectionFetchReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { CampaignsService } from '@services/content/campaigns.service';
import { useQuery } from '@tanstack/react-query';

export function useCampaignPerformance(campaignId: string | undefined) {
  const { getToken } = useAuthIdentity();
  const collectionScope = useCollectionScope();
  const { brandId, organizationId, pageScope } = collectionScope;
  const isEnabled =
    Boolean(campaignId) && isCollectionFetchReady(collectionScope);

  const { data, error, isLoading, refetch } = useQuery({
    enabled: isEnabled,
    queryFn: async (): Promise<ICampaignPerformance> => {
      const token = await resolveAuthToken(getToken);
      if (!token || !campaignId) {
        throw new Error('A campaign is required');
      }
      return CampaignsService.getInstance(token).getPerformance(campaignId);
    },
    queryKey: [
      'publish-campaign-performance',
      organizationId,
      brandId ?? null,
      pageScope,
      campaignId,
    ],
    retry: false,
  });

  return {
    error,
    refetch,
    isLoading: isEnabled && isLoading,
    performance: data ?? null,
  };
}
