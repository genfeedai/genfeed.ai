'use client';

import { EMPTY_PAGE_TOTALS } from '@genfeedai/contracts/constants';
import type { IPagedItems, IPageTotals } from '@genfeedai/contracts/interfaces';
import {
  AgentStrategiesService,
  type AgentStrategy,
} from '@genfeedai/services/automation/agent-strategies.service';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useQuery } from '@tanstack/react-query';

export interface UseAgentStrategiesOptions {
  agentType?: string;
  brandId?: string;
  enabled?: boolean;
  isActive?: boolean;
  /** Page size; only meaningful together with `page`. */
  limit?: number;
  /** When set, fetch only this server page. Omit to load every strategy. */
  page?: number;
}

export interface UseAgentStrategiesReturn {
  strategies: AgentStrategy[];
  pageTotals: IPageTotals;
  /** The last list request's failure; `null` once a request succeeds. */
  error: Error | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const EMPTY_ITEMS: AgentStrategy[] = [];

export function useAgentStrategies(
  options: UseAgentStrategiesOptions = {},
): UseAgentStrategiesReturn {
  const { getToken } = useAuthIdentity();
  const isEnabled = options.enabled ?? true;

  const {
    data: strategiesPage,
    error,
    isLoading,
    refetch,
  } = useQuery<IPagedItems<AgentStrategy> | null>({
    enabled: isEnabled,
    queryKey: [
      'agent-strategies',
      options.brandId,
      options.agentType,
      options.isActive,
      options.page,
      options.limit,
    ],
    queryFn: async ({ signal }) => {
      const token = await resolveAuthToken(getToken);
      if (!token) return null;

      const service = AgentStrategiesService.getInstance(token);
      const filters = {
        agentType: options.agentType,
        brandId: options.brandId,
        isActive: options.isActive,
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
    error: isEnabled ? error : null,
    isLoading,
    refresh: async () => {
      if (!isEnabled) {
        return;
      }
      await refetch();
    },
    strategies: strategiesPage?.items ?? EMPTY_ITEMS,
    pageTotals: strategiesPage?.totals ?? EMPTY_PAGE_TOTALS,
  };
}
