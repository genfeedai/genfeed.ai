'use client';

import type { ICampaignPaidActivation } from '@genfeedai/contracts/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import {
  isCollectionFetchReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { CampaignsService } from '@services/content/campaigns.service';
import { useQuery } from '@tanstack/react-query';

export function useCampaignActivations(campaignId: string | undefined) {
  const { getToken } = useAuthIdentity();
  const collectionScope = useCollectionScope();
  const { brandId, organizationId, pageScope } = collectionScope;
  const isEnabled =
    Boolean(campaignId) && isCollectionFetchReady(collectionScope);

  const { data, isLoading, refetch } = useQuery({
    enabled: isEnabled,
    queryFn: async (): Promise<ICampaignPaidActivation[]> => {
      const token = await resolveAuthToken(getToken);
      if (!token || !campaignId) {
        throw new Error('A campaign is required');
      }
      return CampaignsService.getInstance(token).listActivations(campaignId);
    },
    queryKey: [
      'publish-campaign-activations',
      organizationId,
      brandId ?? null,
      pageScope,
      campaignId,
    ],
    retry: false,
  });

  return {
    activations: data ?? [],
    isLoading: isEnabled && isLoading,
    refetch,
  };
}
