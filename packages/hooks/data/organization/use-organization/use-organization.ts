import type { IOrganizationSetting } from '@cloud/interfaces';
import type { UseOrganizationReturn } from '@cloud/interfaces/hooks/hooks.interface';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { useCallback } from 'react';

/**
 * Hook to access organization settings from BrandContext
 * Settings are fetched once in BrandProvider and shared across all components
 * This prevents N+1 API calls when multiple components need settings
 */
export function useOrganization(): UseOrganizationReturn {
  const {
    organizationId,
    settings,
    settingsLoading: isLoading,
    refreshSettings: refresh,
  } = useBrand();

  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const updateSettings = useCallback(
    async (
      key: keyof IOrganizationSetting,
      value: IOrganizationSetting[keyof IOrganizationSetting],
    ): Promise<void> => {
      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      const url = `PATCH /organizations/${organizationId}/settings`;

      try {
        const service = await getOrganizationsService();

        await service.patchSettings(organizationId, {
          [key]: value,
        });

        // Refresh settings from context to get updated values
        await refresh();

        logger.info(`${url} success`);
      } catch (err) {
        logger.error(`${url} failed`, err);
        throw err;
      }
    },
    [organizationId, refresh, getOrganizationsService],
  );

  return {
    error: null, // Error handling is done in BrandProvider
    isLoading,
    refresh,
    settings,
    updateSettings,
  };
}
