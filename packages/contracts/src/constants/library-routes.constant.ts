import type { IngredientCategory, LibraryShelf } from '..';

import { APP_ROUTES } from './routes.constant';

/**
 * Query keys of the Library browser's control plane.
 *
 * The Library has three orthogonal axes. Only one of them is a path: the shelf
 * (`/library/shelf/:shelf`) and the places (`/library/assets|recent|starred|trash`).
 * Type and folder are query filters that compose on top of whichever route is
 * open — an asset has one type, sits on one shelf, and lives in at most one
 * folder, so none of the three can own the URL alone.
 *
 * @see .agents/memory/feedback_library_information_architecture.md
 */
export const LIBRARY_QUERY_KEYS = {
  /** Repeated key — the type axis (`?categories=IMAGE&categories=VIDEO`). */
  CATEGORIES: 'categories',
  /** Folder axis. Absent means "any folder"; the Unsorted shelf means "none". */
  FOLDER: 'folder',
  SEARCH: 'search',
  SORT: 'sort',
  /** Contact sheet vs. list rows vs. free-placement canvas. */
  VIEW: 'view',
} as const;

export const LIBRARY_VIEW_MODES = ['grid', 'list', 'canvas'] as const;

export type LibraryViewMode = (typeof LIBRARY_VIEW_MODES)[number];

export interface LibraryBrowserRouteOptions {
  categories?: readonly IngredientCategory[];
  folderId?: string;
  search?: string;
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
 * Attach the type / folder / search filters to any Library browser route.
 *
 * Pass the result through `useOrgUrl().href()` to scope it to org + brand.
 */
export function createLibraryBrowserRoute(
  route: string = APP_ROUTES.LIBRARY.ASSETS,
  { categories, folderId, search }: LibraryBrowserRouteOptions = {},
): string {
  const params: string[] = [];

  for (const category of categories ?? []) {
    params.push(
      `${LIBRARY_QUERY_KEYS.CATEGORIES}=${encodeURIComponent(category)}`,
    );
  }

  if (folderId) {
    params.push(`${LIBRARY_QUERY_KEYS.FOLDER}=${encodeURIComponent(folderId)}`);
  }

  if (search) {
    params.push(`${LIBRARY_QUERY_KEYS.SEARCH}=${encodeURIComponent(search)}`);
  }

  const queryString = params.join('&');
  return queryString ? `${route}?${queryString}` : route;
}
