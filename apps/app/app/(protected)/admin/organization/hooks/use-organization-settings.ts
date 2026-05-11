'use client';

import type { IOrganizationSetting } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

export function useOrganizationSettings(organizationId: string | null) {
  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const [isUpdating, setIsUpdating] = useState(false);

  const {
    data: settings = null,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery<IOrganizationSetting | null>({
    queryKey: ['organization-settings', organizationId],
    queryFn: async () => {
      if (!organizationId) {
        throw new Error('Organization ID is required');
      }
      const service = await getOrganizationsService();
      return service.getSettings(organizationId);
    },
    enabled: !!organizationId,
  });

  const isRefreshing = isFetching && !isLoading;

  useEffect(() => {
    if (error) {
      logger.error('GET /organizations/:id/settings failed', error);
    }
  }, [error]);

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const updateSettings = useCallback(
    async (data: Partial<IOrganizationSetting>): Promise<void> => {
      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      setIsUpdating(true);
      const url = `PATCH /organizations/${organizationId}/settings`;

      try {
        const service = await getOrganizationsService();
        await service.patchSettings(organizationId, data);
        logger.info(`${url} success`);
        await refresh();
      } catch (err) {
        logger.error(`${url} failed`, err);
        throw err;
      } finally {
        setIsUpdating(false);
      }
    },
    [organizationId, getOrganizationsService, refresh],
  );

  return {
    error,
    isLoading,
    isRefreshing,
    isUpdating,
    refresh,
    settings,
    updateSettings,
  };
}
