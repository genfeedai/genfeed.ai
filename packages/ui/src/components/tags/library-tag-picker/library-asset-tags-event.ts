import { TagBulkAction } from '@genfeedai/contracts';
import { LIBRARY_ASSET_TAGS_EVENT } from '@genfeedai/contracts/constants';
import type {
  IIngredient,
  ILibraryAssetTagsChange,
} from '@genfeedai/contracts/interfaces';

/**
 * Tell the Library list that tags changed on some assets. The inspector lives
 * in the workspace shell, outside the list's React tree, so the change travels
 * on `window` and the list applies it to the rows it already holds.
 */
export function dispatchLibraryAssetTagsChange(
  change: ILibraryAssetTagsChange,
): void {
  if (typeof window === 'undefined' || change.ingredientIds.length === 0) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ILibraryAssetTagsChange>(LIBRARY_ASSET_TAGS_EVENT, {
      detail: change,
    }),
  );
}

/**
 * Apply a tag change to a list of assets. Rows the change does not touch keep
 * their identity, so memoized cards do not re-render.
 */
export function applyLibraryAssetTagsChange(
  ingredients: IIngredient[],
  change: ILibraryAssetTagsChange,
): IIngredient[] {
  const changedIds = new Set(change.ingredientIds);

  return ingredients.map((ingredient) => {
    if (!changedIds.has(ingredient.id)) {
      return ingredient;
    }

    const others = (ingredient.tags ?? []).filter(
      (tag) => tag.id !== change.tag.id,
    );

    return {
      ...ingredient,
      tags:
        change.action === TagBulkAction.ADD ? [...others, change.tag] : others,
    };
  });
}
