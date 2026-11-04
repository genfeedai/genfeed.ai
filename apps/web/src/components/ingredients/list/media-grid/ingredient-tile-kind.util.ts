import { IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { isFailedIngredient } from '@genfeedai/utils/media/ingredient-ledger.util';
import { getLibraryAssetType } from '@genfeedai/utils/media/library-asset-type.util';

/** Library asset types the masonry grid draws as a tile of its own, not a poster. */
export type IngredientTileKind = 'audio' | 'text';

/**
 * Audio and voice read as a waveform tile and text as a snippet card. Every
 * other type is a visual asset (image, video, GIF, avatar) or has no tile.
 * The kind belongs to the asset itself, not the page it is listed on.
 */
export function getIngredientTileKind(
  ingredient: IIngredient,
): IngredientTileKind | null {
  const assetTypeId = getLibraryAssetType(ingredient.category)?.id;

  if (assetTypeId === 'audio' || assetTypeId === 'voice') {
    return 'audio';
  }

  return assetTypeId === 'text' ? 'text' : null;
}

/** An asset that is still generating, or failed, has no file to play. */
export function isIngredientPlayable(ingredient: IIngredient): boolean {
  return (
    !isFailedIngredient(ingredient) &&
    ingredient.status !== IngredientStatus.PROCESSING
  );
}

/** Fades a tile's type badge while the selection toggle holds its corner. */
export const TYPE_BADGE_CLASS =
  'transition-opacity group-hover/tile:opacity-0 group-focus-within/tile:opacity-0 group-data-[selected=true]/tile:opacity-0';
