'use client';

import type { IContentPlan } from '@genfeedai/contracts/interfaces';
import { ContentPlansService } from '@genfeedai/services/content/content-plans.service';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useQuery } from '@tanstack/react-query';

export interface UseContentPlansOptions {
  brandId?: string;
  enabled?: boolean;
}

export interface UseContentPlansReturn {
  plans: IContentPlan[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useContentPlans(
  options: UseContentPlansOptions = {},
): UseContentPlansReturn {
  const { getToken } = useAuthIdentity();
  const isEnabled = (options.enabled ?? true) && Boolean(options.brandId);

  const {
    data: plans = [] as IContentPlan[],
    isLoading,
    refetch,
  } = useQuery({
    enabled: isEnabled,
    queryFn: async ({ signal }) => {
      const token = await resolveAuthToken(getToken);
      if (!token || !options.brandId) return [];

      const service = ContentPlansService.getInstance(token);
      return service.list(options.brandId, signal);
    },
    queryKey: ['content-plans', options.brandId],
  });

  return {
    isLoading,
    plans,
    refresh: async () => {
      if (!isEnabled) {
        return;
      }
      await refetch();
    },
  };
}
