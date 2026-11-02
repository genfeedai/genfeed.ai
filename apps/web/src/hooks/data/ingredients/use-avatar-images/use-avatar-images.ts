'use client';

import { IngredientCategory } from '@genfeedai/contracts';
import type { IAvatar } from '@genfeedai/contracts/interfaces';
import { logger } from '@genfeedai/services/core/logger.service';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { isAvatarSourceImageIngredient } from '@genfeedai/utils/media/ingredient-type.util';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useCallback } from 'react';

interface UseAvatarImagesResult {
  avatars: IAvatar[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const EMPTY_AVATARS: IAvatar[] = [];

export function useAvatarImages(
  organizationId?: string,
): UseAvatarImagesResult {
  // Cached per organization: coming back to an avatar picker paints the
  // avatars it already has while it refreshes, instead of an empty list.
  const query = useAuthedQuery({
    enabled: Boolean(organizationId),
    queryFn: async (service, signal) => {
      if (!organizationId) {
        return EMPTY_AVATARS;
      }
      try {
        const ingredients = await service.findOrganizationIngredients(
          organizationId,
          {
            category: IngredientCategory.AVATAR,
            limit: 100,
            sort: 'createdAt: -1',
          },
          signal,
        );
        return ingredients.filter((ingredient) =>
          isAvatarSourceImageIngredient(ingredient),
        ) as IAvatar[];
      } catch (error) {
        logger.error('Failed to load avatar ingredients', error);
        throw error;
      }
    },
    queryKey: ['organizations', organizationId ?? null, 'avatar-images'],
    service: (token: string) => OrganizationsService.getInstance(token),
  });

  const { refetch } = query;
  const refresh = useCallback(async () => {
    if (organizationId) {
      await refetch();
    }
  }, [organizationId, refetch]);

  return {
    avatars:
      organizationId && !query.isError
        ? (query.data ?? EMPTY_AVATARS)
        : EMPTY_AVATARS,
    isLoading: query.isLoading,
    refresh,
  };
}
