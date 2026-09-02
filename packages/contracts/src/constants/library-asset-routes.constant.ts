import { IngredientCategory } from '..';

import { APP_ROUTES } from './routes.constant';

/**
 * Library destination for each ingredient category.
 *
 * `IngredientCategory` is SCREAMING_SNAKE because it mirrors its Prisma column
 * labels — it is *not* a route segment. Interpolating it into a path yields
 * `/IMAGEs/...`, and even lowercased it does not match the route tree (there is
 * no `/musics`, and edit variants have no route of their own). Always resolve a
 * destination through this map.
 *
 * Library is one asset browser with type routes as shareable deep links, so
 * edit variants land on the surface that lists them (`IMAGE_EDIT` → images) and
 * categories with no dedicated route fall back to All assets — the unfiltered
 * browser, which lists every type.
 *
 * @see .agents/memory/feedback_library_information_architecture.md
 */
export const LIBRARY_ROUTE_BY_INGREDIENT_CATEGORY: Readonly<
  Record<IngredientCategory, string>
> = {
  [IngredientCategory.AUDIO]: APP_ROUTES.LIBRARY.MUSIC,
  [IngredientCategory.AVATAR]: APP_ROUTES.LIBRARY.AVATARS,
  [IngredientCategory.GIF]: APP_ROUTES.LIBRARY.GIFS,
  [IngredientCategory.IMAGE]: APP_ROUTES.LIBRARY.IMAGES,
  [IngredientCategory.IMAGE_EDIT]: APP_ROUTES.LIBRARY.IMAGES,
  [IngredientCategory.INGREDIENT]: APP_ROUTES.LIBRARY.ASSETS,
  [IngredientCategory.MUSIC]: APP_ROUTES.LIBRARY.MUSIC,
  [IngredientCategory.SOURCE]: APP_ROUTES.LIBRARY.ASSETS,
  [IngredientCategory.TEXT]: APP_ROUTES.LIBRARY.CAPTIONS,
  [IngredientCategory.VIDEO]: APP_ROUTES.LIBRARY.VIDEOS,
  [IngredientCategory.VIDEO_EDIT]: APP_ROUTES.LIBRARY.VIDEOS,
  [IngredientCategory.VOICE]: APP_ROUTES.LIBRARY.VOICES,
};

/**
 * Query key that deep-links a single asset on a library list route.
 * The list resolves it to an ingredient and opens the detail overlay.
 */
export const LIBRARY_ASSET_QUERY_KEY = 'asset';

/** Library list route for a category, or All assets when the category is unknown. */
export function resolveLibraryRouteForCategory(category: unknown): string {
  if (typeof category !== 'string') {
    return APP_ROUTES.LIBRARY.ASSETS;
  }

  return (
    LIBRARY_ROUTE_BY_INGREDIENT_CATEGORY[
      category.toUpperCase() as IngredientCategory
    ] ?? APP_ROUTES.LIBRARY.ASSETS
  );
}

/**
 * Brand-relative library path that deep-links one asset.
 * Pass the result through `useOrgUrl().href()` to scope it to org + brand.
 */
export function createLibraryAssetRoute(
  category: unknown,
  assetId?: string,
): string {
  const route = resolveLibraryRouteForCategory(category);
  if (!assetId) {
    return route;
  }

  return `${route}?${LIBRARY_ASSET_QUERY_KEY}=${encodeURIComponent(assetId)}`;
}
