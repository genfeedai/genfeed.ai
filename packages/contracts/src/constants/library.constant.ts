export const LIBRARY_ASSETS_REFRESH_EVENT = 'library:assets-refresh';

/**
 * Dispatched on `window` after a tag is added to or removed from Library
 * assets, with an `ILibraryAssetTagsChange` as `detail`. The inspector and the
 * bulk bar publish it; the list applies it so cards and rows update in place.
 */
export const LIBRARY_ASSET_TAGS_EVENT = 'library:asset-tags-changed';

/**
 * Dispatched on `window` after a tag is renamed or recolored, with the updated
 * `ITag` as `detail`. The list swaps it into every row that carries it, so
 * cards and the inspector follow without refetching the assets.
 */
export const LIBRARY_TAG_UPDATED_EVENT = 'library:tag-updated';
