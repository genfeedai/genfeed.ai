import type { IIngredient } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { executeWithLoading } from '@hooks/utils/service-operation/service-operation.util';
import { IngredientsService } from '@services/content/ingredients.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useCallback, useState } from 'react';

/**
 * Hook for updating ingredient sharing settings
 *
 * Provides a consistent way to update sharing-related fields (scope, brand, organization, etc.)
 * for any ingredient type (video, image, etc.)
 * Uses the unified PATCH /ingredients/:id endpoint
 *
 * @param ingredient - The ingredient to update sharing settings for
 * @param onUpdate - Optional callback to call after successful update (receives updated ingredient)
 * @returns Object with updateSharing function and isUpdating state
 */
export function useIngredientSharing(
  ingredient: IIngredient | null | undefined,
  onUpdate?: (updatedIngredient: IIngredient) => void | Promise<void>,
) {
  const notificationsService = NotificationsService.getInstance();
  const [isUpdating, setIsUpdating] = useState(false);

  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const updateSharing = useCallback(
    async (field: string, value: boolean | string) => {
      if (!ingredient?.id) {
        return notificationsService.error('Ingredient ID is required');
      }

      const service = await getIngredientsService();
      return executeWithLoading({
        errorMessage: 'Failed to update sharing settings',
        onSuccess: onUpdate,
        operation: () =>
          service.patch(ingredient.id, { [field]: value } as Record<
            string,
            unknown
          >),
        rethrow: true,
        setLoading: setIsUpdating,
        successMessage: 'Sharing settings updated',
        url: `PATCH /ingredients/${ingredient.id} [${field}]`,
      });
    },
    [ingredient, onUpdate, getIngredientsService, notificationsService],
  );

  return {
    isUpdating,
    updateSharing,
  };
}
