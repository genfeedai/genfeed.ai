import { TagBulkAction } from '@genfeedai/contracts';
import {
  LIBRARY_ASSET_TAGS_EVENT,
  LIBRARY_TAG_UPDATED_EVENT,
} from '@genfeedai/contracts/constants';
import type {
  IIngredient,
  ILibraryAssetTagsChange,
  ITag,
} from '@genfeedai/contracts/interfaces';

/**
 * A copy of a row with new tags. List rows are `Ingredient` model instances
 * whose media URLs and labels are prototype getters; an object spread would
 * drop them, blanking the card and inspector previews. The copy keeps the
 * row's prototype.
 */
function withTags(ingredient: IIngredient, tags: ITag[]): IIngredient {
  return Object.assign(
    Object.create(Object.getPrototypeOf(ingredient)) as IIngredient,
    ingredient,
    { tags },
  );
}

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

    return withTags(
      ingredient,
      change.action === TagBulkAction.ADD ? [...others, change.tag] : others,
    );
  });
}

/** Tell the Library list that a tag was renamed or recolored. */
export function dispatchLibraryTagUpdate(tag: ITag): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ITag>(LIBRARY_TAG_UPDATED_EVENT, { detail: tag }),
  );
}

/**
 * Swap an updated tag into every row that carries it. Rows without it keep
 * their identity.
 */
export function applyLibraryTagUpdate(
  ingredients: IIngredient[],
  tag: ITag,
): IIngredient[] {
  return ingredients.map((ingredient) =>
    ingredient.tags?.some((existing) => existing.id === tag.id)
      ? withTags(
          ingredient,
          ingredient.tags.map((existing) =>
            existing.id === tag.id ? { ...existing, ...tag } : existing,
          ),
        )
      : ingredient,
  );
}
