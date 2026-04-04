import type { IIngredient, ITag } from '@cloud/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { withSilentOperation } from '@hooks/utils/service-operation/service-operation.util';
import { IngredientsService } from '@services/content/ingredients.service';
import { useCallback, useState } from 'react';

export interface UseIngredientTagsParams {
  ingredient: IIngredient;
  availableTags?: ITag[];
  onUpdateParent?: (updatedIngredient: IIngredient, id: string) => void;
  onRefresh?: () => void;
}

export function useIngredientTags({
  ingredient,
  availableTags,
  onUpdateParent,
  onRefresh,
}: UseIngredientTagsParams) {
  const [isUpdatingTags, setIsUpdatingTags] = useState(false);
  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const handleTagsChange = useCallback(
    async (tagIds: string[]) => {
      if (!ingredient.id || isUpdatingTags) {
        return;
      }

      setIsUpdatingTags(true);
      try {
        const service = await getIngredientsService();
        await withSilentOperation({
          errorMessage: 'Failed to update tags',
          onSuccess: onRefresh,
          operation: () => service.patchTags(ingredient.id, tagIds),
          url: `PATCH /ingredients/${ingredient.id}/tags`,
        });
      } finally {
        setIsUpdatingTags(false);
      }
    },
    [ingredient, onRefresh, isUpdatingTags, getIngredientsService],
  );

  const handleRemoveTag = useCallback(
    async (tagId: string) => {
      const currentTagIds = (ingredient.tags || [])
        .filter((t) => t != null)
        .map((t) => {
          if (typeof t === 'string') {
            return t;
          }
          if (typeof t === 'object' && t.id) {
            return t.id;
          }
          return null;
        })
        .filter((id): id is string => !!id);

      const newTagIds = currentTagIds.filter((id) => id !== tagId);
      await handleTagsChange(newTagIds);
    },
    [ingredient.tags, handleTagsChange],
  );

  return {
    handleRemoveTag,
    handleTagsChange,
    isUpdatingTags,
  };
}
