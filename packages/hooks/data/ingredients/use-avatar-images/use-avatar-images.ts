'use client';

import { IngredientCategory } from '@genfeedai/enums';
import type { IAvatar } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { isAvatarSourceImageIngredient } from '@utils/media/ingredient-type.util';
import { useCallback, useEffect, useState } from 'react';

interface UseAvatarImagesResult {
  avatars: IAvatar[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useAvatarImages(
  organizationId?: string,
): UseAvatarImagesResult {
  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );
  const [avatars, setAvatars] = useState<IAvatar[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!organizationId) {
      setAvatars([]);
      return;
    }

    setIsLoading(true);

    try {
      const service = await getOrganizationsService();
      const ingredients = await service.findOrganizationIngredients(
        organizationId,
        {
          category: IngredientCategory.AVATAR,
          limit: 100,
          sort: 'createdAt: -1',
        },
      );

      setAvatars(
        ingredients.filter((ingredient) =>
          isAvatarSourceImageIngredient(ingredient),
        ) as IAvatar[],
      );
    } catch (error) {
      logger.error('Failed to load avatar ingredients', error);
      setAvatars([]);
    } finally {
      setIsLoading(false);
    }
  }, [getOrganizationsService, organizationId]);

  useEffect(() => {
    refresh().catch((error) => {
      logger.error('Failed to refresh avatar ingredients', error);
    });
  }, [refresh]);

  return {
    avatars,
    isLoading,
    refresh,
  };
}
