'use client';

import { useUser } from '@clerk/nextjs';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { UsersService } from '@services/organization/users.service';
import { useCallback } from 'react';

export function useBrandSwitchHandler(
  brandId: string,
  onBrandChange?: (brandId: string) => void,
): (newBrandId: string) => Promise<void> {
  const { user } = useUser();
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  return useCallback(
    async (newBrandId: string) => {
      if (!user) {
        return logger.error('Cannot switch brand: user not authenticated');
      }

      try {
        logger.info('Switching brand via command palette', {
          from: brandId,
          to: newBrandId,
        });

        const service = await getUsersService();
        await service.patchMeBrand(newBrandId, { isSelected: true });
        await user.reload();

        onBrandChange?.(newBrandId);

        logger.info('Brand switched successfully', { brandId: newBrandId });
      } catch (error) {
        logger.error('Failed to switch brand', error);
      }
    },
    [brandId, onBrandChange, user, getUsersService],
  );
}
