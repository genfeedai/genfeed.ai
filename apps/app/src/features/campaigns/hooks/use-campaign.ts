'use client';

import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import {
  isCollectionFetchReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import {
  type Campaign,
  CampaignsService,
} from '@services/content/campaigns.service';
import { isServiceOperationError } from '@services/core/operation-error';
import { useQuery } from '@tanstack/react-query';

function isNotFoundError(error: unknown): boolean {
  if (isServiceOperationError(error) && error.status === 404) {
    return true;
  }
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status?: number }).status === 404
  );
}

export function useCampaign(campaignId: string | undefined) {
  const { getToken } = useAuthIdentity();
  const collectionScope = useCollectionScope();
  const { brandId, organizationId, pageScope } = collectionScope;
  const isEnabled =
    Boolean(campaignId) && isCollectionFetchReady(collectionScope);

  const { data, error, isLoading, refetch } = useQuery({
    enabled: isEnabled,
    queryFn: async (): Promise<Campaign> => {
      const token = await resolveAuthToken(getToken);
      if (!token || !campaignId) {
        throw new Error('A campaign is required');
      }
      const campaign =
        await CampaignsService.getInstance(token).getById(campaignId);
      if (pageScope === 'brand' && brandId && campaign.brandId !== brandId) {
        const mismatch = new Error('Campaign is unavailable');
        (mismatch as Error & { status: number }).status = 404;
        throw mismatch;
      }
      return campaign;
    },
    queryKey: [
      'publish-campaign',
      campaignId,
      organizationId,
      brandId ?? null,
      pageScope,
    ],
    retry: false,
  });

  return {
    campaign: data ?? null,
    isLoading: isEnabled && isLoading,
    isUnavailable: isNotFoundError(error),
    refetch,
  };
}
