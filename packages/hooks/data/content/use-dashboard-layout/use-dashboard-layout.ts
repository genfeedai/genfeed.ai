'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import type { IDashboardLayout } from '@genfeedai/interfaces';
import { DashboardLayoutsService } from '@genfeedai/services/content/dashboard-layouts.service';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

const DEFAULT_PAGE_KEY = 'workspace-overview';

export interface UseDashboardLayoutOptions {
  brandId?: string;
  pageKey?: string;
}

export function useDashboardLayout({
  brandId: providedBrandId,
  pageKey = DEFAULT_PAGE_KEY,
}: UseDashboardLayoutOptions = {}) {
  const { isSignedIn } = useAuthIdentity();
  const { brandId: contextBrandId } = useBrand();
  const brandId = providedBrandId ?? contextBrandId;
  const queryClient = useQueryClient();

  const getDashboardLayoutsService = useAuthedService((token: string) =>
    DashboardLayoutsService.getInstance(token),
  );

  const queryKey = useMemo(
    () => ['dashboard-layout', brandId, pageKey],
    [brandId, pageKey],
  );

  const {
    data: layout,
    isLoading,
    error,
    refetch,
  } = useQuery<IDashboardLayout | undefined>({
    queryKey,
    queryFn: async () => {
      if (!brandId) {
        return undefined;
      }
      const service = await getDashboardLayoutsService();
      return service.findForPage(brandId, pageKey);
    },
    enabled: !!isSignedIn && !!brandId,
  });

  const resetLayout = useCallback(async (): Promise<void> => {
    if (!layout?.id) {
      return;
    }
    const service = await getDashboardLayoutsService();
    await service.removeLayout(layout.id);
    await queryClient.invalidateQueries({ queryKey });
  }, [layout?.id, getDashboardLayoutsService, queryClient, queryKey]);

  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    error,
    isLoading,
    layout,
    refetch,
    refresh,
    resetLayout,
  };
}
