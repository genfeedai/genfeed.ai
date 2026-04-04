'use client';

import type { IOrganizationSetting } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { useCallback, useState } from 'react';

export function useOrganizationSettings(organizationId: string | null) {
  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const [isUpdating, setIsUpdating] = useState(false);

  const {
    data: settings,
    isLoading,
    isRefreshing,
    refresh,
    error,
  } = useResource<IOrganizationSetting>(
    async () => {
      if (!organizationId) {
        throw new Error('Organization ID is required');
      }
      const service = await getOrganizationsService();
      return service.getSettings(organizationId);
    },
    {
      dependencies: [organizationId],
      enabled: !!organizationId,
      onError: (error: unknown) => {
        logger.error('GET /organizations/:id/settings failed', error);
      },
    },
  );

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
      } catch (error) {
        logger.error(`${url} failed`, error);
        throw error;
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
