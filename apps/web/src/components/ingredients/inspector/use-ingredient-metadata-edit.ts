import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import type { IngredientMetadataField } from '@/props/content/ingredient.props';
import { dispatchLibraryAssetMetadataChange } from './library-asset-metadata-event';

/**
 * Saves an asset's label or description through
 * `PATCH /ingredients/:id/metadata`, then tells the Library list so the card,
 * the table row and the inspector show the new value. Resolves to whether the
 * value was saved.
 */
export function useIngredientMetadataEdit(ingredient: IIngredient): {
  isSaving: boolean;
  saveField: (
    field: IngredientMetadataField,
    value: string,
  ) => Promise<boolean>;
} {
  const translate = useTranslations('pages.library.inspector');
  const [isSaving, setIsSaving] = useState(false);
  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const saveField = useCallback(
    async (field: IngredientMetadataField, value: string): Promise<boolean> => {
      setIsSaving(true);
      try {
        const service = await getIngredientsService();
        await service.patchMetadata(ingredient.id, { [field]: value });
        dispatchLibraryAssetMetadataChange({
          ingredientId: ingredient.id,
          [field]: value,
        });
        return true;
      } catch (error: unknown) {
        logger.error('Failed to save asset metadata', {
          error,
          field,
          ingredientId: ingredient.id,
        });
        NotificationsService.getInstance().error(
          translate(field === 'label' ? 'renameFailed' : 'descriptionFailed'),
        );
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [getIngredientsService, ingredient.id, translate],
  );

  return { isSaving, saveField };
}
