import {
  IngredientCategory,
  type IngredientOrigin,
  LibraryPlace,
  type LibraryShelf,
  parseIngredientCategory,
  parseLibraryShelf,
  type TagMatchMode,
} from '..';

import { APP_ROUTES } from './routes.constant';

/** Query keys for the composable Library filters and layout. */
export const LIBRARY_QUERY_KEYS = {
  /** Repeated key — the type axis (`?categories=IMAGE&categories=VIDEO`). */
  CATEGORIES: 'categories',
  /**
   * Repeated key — the character filter (`?characters=<id>&characters=<id>`).
   * A filter like origin, never a navigation destination.
   */
  CHARACTERS: 'characters',
  /** Folder axis. Absent means "any folder"; the Unsorted shelf means "none". */
  FOLDER: 'folder',
  /**
   * Repeated key — the origin filter (`?origins=UPLOADED&origins=IMPORTED`).
   * A filter beside type, shelf and folder, never a navigation destination.
   */
  ORIGINS: 'origins',
  PLACE: 'place',
  SHELF: 'shelf',
  SEARCH: 'search',
  SORT: 'sort',
  /** `any` (default) or `all` — how the repeated `tags` key combines. */
  TAG_MATCH: 'tagMatch',
  /**
   * Repeated key — the tag filter (`?tags=<id>&tags=<id>`). Tags carry human
   * judgment (campaign, series, episode); like origin and character it is a
   * filter, never a navigation destination.
   */
  TAGS: 'tags',
  /** Contact sheet vs. list rows vs. free-placement canvas. */
  VIEW: 'view',
} as const;

/** Most characters one Library query may filter by; the API rejects more. */
export const LIBRARY_MAX_CHARACTER_FILTERS = 25;

/** Most tags one Library query may filter by; the API rejects more. */
export const LIBRARY_MAX_TAG_FILTERS = 25;

/** Most assets one bulk tag request may change; the API rejects more. */
export const LIBRARY_BULK_TAG_LIMIT = 200;

export const LIBRARY_VIEW_MODES = ['grid', 'list', 'canvas'] as const;

export type LibraryViewMode = (typeof LIBRARY_VIEW_MODES)[number];

export interface LibraryBrowserRouteOptions {
  categories?: readonly IngredientCategory[];
  characters?: readonly string[];
  folderId?: string;
  origins?: readonly IngredientOrigin[];
  search?: string;
  tagMatch?: TagMatchMode;
  tags?: readonly string[];
  view?: LibraryViewMode;
}

/**
 * Shelf deep link — `/library/shelf/needs-review`.
 *
 * A shelf is a saved query, not a location, so the segment is the lowercase
 * `LibraryShelf` product key rather than a persisted status label.
 */
export function createLibraryShelfRoute(shelf: LibraryShelf): string {
  return `${APP_ROUTES.LIBRARY.SHELF}/${shelf}`;
}

/**
 * The category sets that have a route of their own. Any other selection stays
 * on All assets as `?categories=`.
 */
export const LIBRARY_TYPE_PRESET_CATEGORIES: Readonly<
  Record<string, readonly IngredientCategory[]>
> = {
  [APP_ROUTES.LIBRARY.AVATARS]: [IngredientCategory.AVATAR],
  [APP_ROUTES.LIBRARY.GIFS]: [IngredientCategory.GIF],
  [APP_ROUTES.LIBRARY.IMAGES]: [
    IngredientCategory.IMAGE,
    IngredientCategory.IMAGE_EDIT,
  ],
  [APP_ROUTES.LIBRARY.MUSIC]: [
    IngredientCategory.MUSIC,
    IngredientCategory.AUDIO,
  ],
  [APP_ROUTES.LIBRARY.VIDEOS]: [
    IngredientCategory.VIDEO,
    IngredientCategory.VIDEO_EDIT,
  ],
};

const LIBRARY_PLACE_ROUTES: Readonly<Record<string, string>> = {
  [LibraryPlace.RECENT]: APP_ROUTES.LIBRARY.RECENT,
  [LibraryPlace.STARRED]: APP_ROUTES.LIBRARY.STARRED,
  [LibraryPlace.TRASH]: APP_ROUTES.LIBRARY.TRASH,
};

export interface LibraryAxes {
  categories?: readonly IngredientCategory[];
  place?: LibraryPlace | null;
  shelf?: LibraryShelf | null;
}

export interface LibraryAxisRoute {
  /** True when the route already says which categories are selected. */
  hasCategoriesInPath: boolean;
  route: string;
}

/**
 * The one Library path for a set of axes. The path says which view you are in,
 * so only one axis can own it: a place (Trash, Recent, Starred) wins, then a
 * shelf, then a type set that has a route of its own. Whatever the path does
 * not say (`hasCategoriesInPath` false) stays a query param.
 */
export function resolveLibraryAxisRoute({
  categories = [],
  place,
  shelf,
}: LibraryAxes): LibraryAxisRoute {
  const placeRoute = place ? LIBRARY_PLACE_ROUTES[place] : undefined;
  if (placeRoute) {
    return { hasCategoriesInPath: false, route: placeRoute };
  }

  if (shelf) {
    return {
      hasCategoriesInPath: false,
      route: createLibraryShelfRoute(shelf),
    };
  }

  const selected = new Set(categories);
  const preset = Object.entries(LIBRARY_TYPE_PRESET_CATEGORIES).find(
    ([, presetCategories]) =>
      presetCategories.length === selected.size &&
      presetCategories.every((category) => selected.has(category)),
  );
  if (preset) {
    return { hasCategoriesInPath: true, route: preset[0] };
  }

  return { hasCategoriesInPath: false, route: APP_ROUTES.LIBRARY.ASSETS };
}

/**
 * The admin Library path for a set of categories. Admin has no places or
 * shelves, so the type is the only axis the path can own: a type set with a
 * route of its own (`/admin/content/ingredients/images`) or the root.
 */
export function resolveAdminLibraryAxisRoute(
  categories: readonly IngredientCategory[] = [],
): LibraryAxisRoute {
  const axisRoute = resolveLibraryAxisRoute({ categories });
  const typeSegment = axisRoute.route.slice(axisRoute.route.lastIndexOf('/'));

  return {
    hasCategoriesInPath: axisRoute.hasCategoriesInPath,
    route: axisRoute.hasCategoriesInPath
      ? `${APP_ROUTES.ADMIN.CONTENT.INGREDIENTS}${typeSegment}`
      : APP_ROUTES.ADMIN.CONTENT.INGREDIENTS,
  };
}

/**
 * Attach the type / character / origin / tag / folder / search filters to any Library browser route.
 *
 * Pass the result through `useOrgUrl().href()` to scope it to org + brand.
 */
export function createLibraryBrowserRoute(
  route: string = APP_ROUTES.LIBRARY.ASSETS,
  {
    categories,
    characters,
    folderId,
    origins,
    search,
    tagMatch,
    tags,
    view,
  }: LibraryBrowserRouteOptions = {},
): string {
  const [pathname, existingSearch = ''] = route.split('?');
  const params = new URLSearchParams(existingSearch);
  if (categories) params.delete(LIBRARY_QUERY_KEYS.CATEGORIES);

  for (const category of categories ?? []) {
    params.append(LIBRARY_QUERY_KEYS.CATEGORIES, category);
  }

  if (characters) params.delete(LIBRARY_QUERY_KEYS.CHARACTERS);

  for (const character of characters ?? []) {
    params.append(LIBRARY_QUERY_KEYS.CHARACTERS, character);
  }

  if (origins) params.delete(LIBRARY_QUERY_KEYS.ORIGINS);

  for (const origin of origins ?? []) {
    params.append(LIBRARY_QUERY_KEYS.ORIGINS, origin);
  }

  if (tags) params.delete(LIBRARY_QUERY_KEYS.TAGS);

  for (const tag of tags ?? []) {
    params.append(LIBRARY_QUERY_KEYS.TAGS, tag);
  }

  if (tagMatch) {
    params.set(LIBRARY_QUERY_KEYS.TAG_MATCH, tagMatch);
  }

  if (folderId) {
    params.set(LIBRARY_QUERY_KEYS.FOLDER, folderId);
  }

  if (search) {
    params.set(LIBRARY_QUERY_KEYS.SEARCH, search);
  }

  if (view) {
    params.set(LIBRARY_QUERY_KEYS.VIEW, view);
  }

  const queryString = params.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

type LegacyLibrarySearchParams = Record<string, string | string[] | undefined>;

/**
 * Old Library links carried the view in the query (`/library/assets?place=trash`,
 * `?shelf=approved`, `?categories=IMAGE&categories=IMAGE_EDIT`). Returns the
 * route that now owns that view, with every other param kept, or null when
 * the URL is already canonical.
 */
export function resolveLegacyLibraryRoute(
  searchParams: LegacyLibrarySearchParams,
): string | null {
  const values = (key: string): string[] => [searchParams[key] ?? []].flat();
  const [placeValue] = values(LIBRARY_QUERY_KEYS.PLACE);
  const [shelfValue] = values(LIBRARY_QUERY_KEYS.SHELF);
  const place = Object.values(LibraryPlace).find(
    (candidate) => candidate === placeValue,
  );
  const shelf = parseLibraryShelf(shelfValue);
  const categories = values(LIBRARY_QUERY_KEYS.CATEGORIES)
    .map((value) => parseIngredientCategory(value))
    .filter((value): value is IngredientCategory => Boolean(value));

  const axisRoute = resolveLibraryAxisRoute({ categories, place, shelf });
  const hasLegacyAxis =
    searchParams[LIBRARY_QUERY_KEYS.PLACE] !== undefined ||
    searchParams[LIBRARY_QUERY_KEYS.SHELF] !== undefined;
  if (!hasLegacyAxis && axisRoute.route === APP_ROUTES.LIBRARY.ASSETS) {
    return null;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (
      value === undefined ||
      key === LIBRARY_QUERY_KEYS.PLACE ||
      key === LIBRARY_QUERY_KEYS.SHELF ||
      (key === LIBRARY_QUERY_KEYS.CATEGORIES && axisRoute.hasCategoriesInPath)
    ) {
      continue;
    }
    for (const entry of [value].flat()) {
      params.append(key, entry);
    }
  }
  const query = params.toString();
  return query ? `${axisRoute.route}?${query}` : axisRoute.route;
}
