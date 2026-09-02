import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';

import { isVideoIngredient } from './ingredient-type.util';

/**
 * Next/Image (and <img>) cannot decode these. Feeding an mp4 into the table
 * thumbnail is what rendered the broken "Ing URI" alt text on Library list rows.
 */
const NON_RASTER_EXTENSION =
  /\.(3gp|aac|avi|flac|m4a|m4v|mkv|mov|mp3|mp4|mpeg|ogg|wav|webm)(?:$|\?)/i;

export function isRasterPreviewUrl(
  url: string | null | undefined,
): url is string {
  if (!url) {
    return false;
  }

  return !NON_RASTER_EXTENSION.test(url);
}

function prefersThumbnail(ingredient: IIngredient): boolean {
  return (
    isVideoIngredient(ingredient) ||
    ingredient.category === IngredientCategory.VIDEO_EDIT
  );
}

/**
 * Poster/image URL safe to pass to next/image. Videos prefer `thumbnailUrl`
 * and never fall back to the mp4 itself.
 */
export function getIngredientPreviewUrl(
  ingredient: IIngredient | null | undefined,
): string | undefined {
  if (!ingredient) {
    return undefined;
  }

  const candidates = prefersThumbnail(ingredient)
    ? [ingredient.thumbnailUrl, ingredient.ingredientUrl]
    : [ingredient.ingredientUrl, ingredient.thumbnailUrl];

  for (const candidate of candidates) {
    if (isRasterPreviewUrl(candidate)) {
      return candidate;
    }
  }

  return undefined;
}
