import {
  LIBRARY_ASSET_METADATA_EVENT,
  LIBRARY_ASSET_RENAME_REQUEST_EVENT,
} from '@genfeedai/contracts/constants';
import type {
  IIngredient,
  ILibraryAssetMetadataChange,
  ILibraryAssetRenameRequest,
  IMetadata,
} from '@genfeedai/contracts/interfaces';

/**
 * A copy of a row with new label/description. List rows are `Ingredient`
 * model instances whose labels are prototype getters reading `metadata`; an
 * object spread would drop them, so the copy keeps the row's prototype and
 * replaces only `metadata`.
 */
function withMetadata(
  ingredient: IIngredient,
  change: ILibraryAssetMetadataChange,
): IIngredient {
  const current =
    ingredient.metadata && typeof ingredient.metadata === 'object'
      ? ingredient.metadata
      : undefined;
  const metadata = {
    ...current,
    ...(change.label === undefined ? {} : { label: change.label }),
    ...(change.description === undefined
      ? {}
      : { description: change.description }),
  } as IMetadata;

  return Object.assign(
    Object.create(Object.getPrototypeOf(ingredient)) as IIngredient,
    ingredient,
    { metadata },
  );
}

/**
 * Tell the Library list that an asset's label or description was saved. The
 * inspector lives in the workspace shell, outside the list's React tree, so
 * the change travels on `window`.
 */
export function dispatchLibraryAssetMetadataChange(
  change: ILibraryAssetMetadataChange,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ILibraryAssetMetadataChange>(LIBRARY_ASSET_METADATA_EVENT, {
      detail: change,
    }),
  );
}

/**
 * Apply a saved edit to the rows. Rows it does not touch keep their identity,
 * so memoized cards do not re-render.
 */
export function applyLibraryAssetMetadataChange(
  ingredients: IIngredient[],
  change: ILibraryAssetMetadataChange,
): IIngredient[] {
  return ingredients.map((ingredient) =>
    ingredient.id === change.ingredientId
      ? withMetadata(ingredient, change)
      : ingredient,
  );
}

/**
 * A Rename asked for before the inspector mounted. The rail loads lazily, so
 * a tile's Rename can fire before the title field exists to hear it; the field
 * claims this on mount.
 */
let pendingRenameId: string | null = null;

/** Ask the inspector to put this asset's title into edit mode. */
export function requestLibraryAssetRename(ingredientId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  pendingRenameId = ingredientId;
  window.dispatchEvent(
    new CustomEvent<ILibraryAssetRenameRequest>(
      LIBRARY_ASSET_RENAME_REQUEST_EVENT,
      { detail: { ingredientId } },
    ),
  );
}

/** True once, when a Rename for this asset is still waiting for its field. */
export function claimPendingLibraryAssetRename(ingredientId: string): boolean {
  if (pendingRenameId !== ingredientId) {
    return false;
  }

  pendingRenameId = null;
  return true;
}
