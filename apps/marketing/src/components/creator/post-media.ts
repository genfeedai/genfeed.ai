import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';

export interface CreatorPostMediaItem {
  height?: number;
  id: string;
  kind: 'image' | 'video';
  url: string;
  width?: number;
}

type MediaSource = Pick<IIngredient, 'category' | 'id' | 'status'> & {
  height?: number;
  ingredientUrl?: string;
  width?: number;
};

const KIND_BY_CATEGORY: Partial<Record<string, CreatorPostMediaItem['kind']>> =
  {
    [IngredientCategory.GIF]: 'image',
    [IngredientCategory.IMAGE]: 'image',
    [IngredientCategory.VIDEO]: 'video',
  };

/**
 * The images and videos a post renders with, in posting order. Media that is
 * still processing, failed, or has no deliverable URL is left out rather than
 * drawn as a broken frame.
 */
export function getPostMedia(
  ingredients: readonly MediaSource[] | undefined,
): CreatorPostMediaItem[] {
  return (ingredients ?? []).flatMap((ingredient) => {
    const kind =
      KIND_BY_CATEGORY[String(ingredient.category ?? '').toUpperCase()];
    const url = ingredient.ingredientUrl ?? '';
    if (
      !kind ||
      !url ||
      ingredient.status === IngredientStatus.PROCESSING ||
      ingredient.status === IngredientStatus.FAILED
    ) {
      return [];
    }
    return [
      {
        height: ingredient.height,
        id: ingredient.id,
        kind,
        url,
        width: ingredient.width,
      },
    ];
  });
}
