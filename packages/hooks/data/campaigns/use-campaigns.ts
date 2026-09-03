'use client';

import type { ContentCampaignStatus } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import {
  isCollectionFetchReady,
  toBrandListParams,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import {
  type Campaign,
  type CampaignListQuery,
  CampaignsService,
} from '@services/content/campaigns.service';
import { useQuery } from '@tanstack/react-query';

export interface UseCampaignsOptions {
  includeArchived?: boolean;
  page?: number;
  status?: ContentCampaignStatus | string;
}

const EMPTY_PAGE: IPaginatedResponse<Campaign> = {
  hasNext: false,
  hasPrevious: false,
  items: [],
  page: 1,
  pageSize: ITEMS_PER_PAGE,
  total: 0,
  totalPages: 1,
};

export function useCampaigns(options: UseCampaignsOptions = {}) {
  const { getToken } = useAuthIdentity();
  const collectionScope = useCollectionScope();
  const { brandId, organizationId, pageScope } = collectionScope;
  const isEnabled = isCollectionFetchReady(collectionScope);
  const page = options.page ?? 1;
  const includeArchived =
    options.includeArchived ??
    (options.status === undefined ? false : undefined);

  const query: CampaignListQuery = {
    ...toBrandListParams({ brandId }),
    ...(includeArchived === undefined ? {} : { includeArchived }),
    limit: ITEMS_PER_PAGE,
    page,
    ...(options.status ? { status: options.status } : {}),
  };

  const {
    data = EMPTY_PAGE,
    isLoading,
    refetch,
  } = useQuery({
    enabled: isEnabled,
    queryFn: async () => {
      const token = await resolveAuthToken(getToken);
      if (!token) {
        return EMPTY_PAGE;
      }
      return CampaignsService.getInstance(token).list(query);
    },
    queryKey: [
      'publish-campaigns',
      organizationId,
      brandId ?? null,
      pageScope,
      options.status ?? null,
      includeArchived ?? null,
      page,
    ],
  });

  return {
    campaigns: data.items,
    isLoading: !isEnabled || isLoading,
    page: data.page,
    refetch,
    total: data.total,
    totalPages: data.totalPages,
  };
}
