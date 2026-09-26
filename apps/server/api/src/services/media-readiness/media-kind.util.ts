import { IngredientCategory } from '@genfeedai/contracts';
import type { MediaReadinessKind } from '@genfeedai/contracts/api-types/contracts';

/**
 * Which media kind each ingredient category is measured as. Categories absent
 * here carry no media to check or perceive (text, source, …). Shared by the
 * readiness gate (#4878) and media perception (#4879).
 */
const MEDIA_KIND_BY_CATEGORY: Partial<
  Record<IngredientCategory, MediaReadinessKind>
> = {
  [IngredientCategory.AUDIO]: 'audio',
  [IngredientCategory.AVATAR]: 'video',
  [IngredientCategory.GIF]: 'image',
  [IngredientCategory.IMAGE]: 'image',
  [IngredientCategory.IMAGE_EDIT]: 'image',
  [IngredientCategory.MUSIC]: 'audio',
  [IngredientCategory.VIDEO]: 'video',
  [IngredientCategory.VIDEO_EDIT]: 'video',
  [IngredientCategory.VOICE]: 'audio',
};

export const MEDIA_INGREDIENT_CATEGORIES = Object.keys(
  MEDIA_KIND_BY_CATEGORY,
) as IngredientCategory[];

export function resolveMediaKind(
  category: string | null | undefined,
): MediaReadinessKind | null {
  if (!category) {
    return null;
  }
  return MEDIA_KIND_BY_CATEGORY[category as IngredientCategory] ?? null;
}
