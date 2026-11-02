'use client';

import { EMPTY_PAGE_TOTALS } from '@genfeedai/contracts/constants';
import type { IPagedItems, IPageTotals } from '@genfeedai/contracts/interfaces';
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
  pageTotals: IPageTotals;
  /** The last list request's failure; `null` once a request succeeds. */
  error: Error | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const EMPTY_ITEMS: AgentCampaign[] = [];

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
    data: campaignsPage,
    error,
    isLoading,
    refetch,
  } = useQuery<IPagedItems<AgentCampaign> | null>({
    enabled: isEnabled,
    queryKey: [
      'agent-campaigns',
      brandId ?? null,
      pageScope,
      options.status,
      options.page,
      options.limit,
    ],
    queryFn: async ({ signal }) => {
      const token = await resolveAuthToken(getToken);
      if (!token) return null;

      const service = AgentCampaignsService.getInstance(token);
      const filters = {
        ...toBrandListParams({ brandId }),
        status: options.status,
      };
      if (options.page) {
        const page = await service.findAllPage(
          { ...filters, limit: options.limit, page: options.page },
          signal,
        );
        return {
          items: page.items,
          totals: { totalDocs: page.total, totalPages: page.totalPages },
        };
      }
      const items = await service.list(filters);
      return { items, totals: { totalDocs: items.length, totalPages: 1 } };
    },
  });

  return {
    campaigns: campaignsPage?.items ?? EMPTY_ITEMS,
    pageTotals: campaignsPage?.totals ?? EMPTY_PAGE_TOTALS,
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
