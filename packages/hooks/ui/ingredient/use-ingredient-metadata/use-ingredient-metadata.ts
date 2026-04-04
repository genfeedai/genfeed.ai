import type { IIngredient, IMetadata } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useCallback, useState } from 'react';

/**
 * Hook for updating ingredient metadata
 *
 * Provides a consistent way to update metadata for any ingredient type (video, image, etc.)
 * Uses the unified PATCH /ingredients/:id/metadata endpoint
 *
 * @param ingredient - The ingredient to update metadata for
 * @param onUpdate - Optional callback to call after successful update (receives updated ingredient)
 * @param onReload - Optional callback to reload the ingredient using the correct service (e.g., VideosService, ImagesService)
 * @returns Object with updateMetadata function and isUpdating state
 */
export function useIngredientMetadata(
  ingredient: IIngredient | null | undefined,
  onUpdate?: (updatedIngredient: IIngredient) => void | Promise<void>,
  onReload?: () => Promise<IIngredient>,
) {
  const notificationsService = NotificationsService.getInstance();
  const [isUpdating, setIsUpdating] = useState(false);

  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const updateMetadata = useCallback(
    async (field: string, value: string) => {
      if (!ingredient?.id) {
        return notificationsService.error('Ingredient ID is required');
      }

      if (!ingredient.metadata) {
        return notificationsService.error('Ingredient does not have metadata');
      }

      // Ensure metadata is an object before spreading
      if (typeof ingredient.metadata !== 'object') {
        return notificationsService.error('Invalid metadata format');
      }

      const url = `PATCH /ingredients/${ingredient.id}/metadata [${field}]`;
      setIsUpdating(true);

      try {
        const service = await getIngredientsService();
        const updatedMetadata: IMetadata = {
          ...(ingredient.metadata as IMetadata),
          [field]: value,
        };

        // Patch metadata
        await service.patchMetadata(ingredient.id, updatedMetadata);

        // Reload the ingredient using the provided reload callback (uses correct service)
        let reloadedIngredient: IIngredient | undefined;
        if (onReload) {
          const result = await onReload();
          reloadedIngredient = result;
        }

        logger.info(`${url} success`, reloadedIngredient);
        notificationsService.success('Updated successfully');

        if (onUpdate && reloadedIngredient) {
          await onUpdate(reloadedIngredient);
        }

        setIsUpdating(false);
        return reloadedIngredient;
      } catch (error: any) {
        logger.error(`${url} failed`, error);
        notificationsService.error('Failed to update');
        setIsUpdating(false);
        throw error;
      }
    },
    [
      ingredient,
      getIngredientsService,
      notificationsService,
      onUpdate,
      onReload,
    ],
  );

  return {
    isUpdating,
    updateMetadata,
  };
}
