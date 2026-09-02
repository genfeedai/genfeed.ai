import { describe, expect, it } from 'vitest';
import { IngredientCategory, LibraryShelf } from '..';

import {
  createLibraryBrowserRoute,
  createLibraryShelfRoute,
  LIBRARY_QUERY_KEYS,
} from './library-routes.constant';
import { APP_ROUTES } from './routes.constant';

describe('createLibraryShelfRoute', () => {
  it('builds a shelf deep link from the lowercase product key', () => {
    expect(createLibraryShelfRoute(LibraryShelf.NEEDS_REVIEW)).toBe(
      '/library/shelf/needs-review',
    );
  });

  it('keeps every shelf under the canonical shelf prefix', () => {
    expect(
      createLibraryShelfRoute(LibraryShelf.GENERATING).startsWith(
        `${APP_ROUTES.LIBRARY.SHELF}/`,
      ),
    ).toBe(true);
  });
});

describe('createLibraryBrowserRoute', () => {
  it('defaults to All assets with no filters', () => {
    expect(createLibraryBrowserRoute()).toBe(APP_ROUTES.LIBRARY.ASSETS);
  });

  it('repeats the categories key so the type axis stays multi-select', () => {
    expect(
      createLibraryBrowserRoute(APP_ROUTES.LIBRARY.ASSETS, {
        categories: [IngredientCategory.IMAGE, IngredientCategory.VIDEO],
      }),
    ).toBe('/library/assets?categories=IMAGE&categories=VIDEO');
  });

  it('composes the type and folder axes on a shelf route', () => {
    expect(
      createLibraryBrowserRoute(
        createLibraryShelfRoute(LibraryShelf.APPROVED),
        {
          categories: [IngredientCategory.VIDEO],
          folderId: 'folder-1',
        },
      ),
    ).toBe('/library/shelf/approved?categories=VIDEO&folder=folder-1');
  });

  it('encodes search terms', () => {
    expect(
      createLibraryBrowserRoute(APP_ROUTES.LIBRARY.ASSETS, {
        search: 'launch teaser',
      }),
    ).toBe(`/library/assets?${LIBRARY_QUERY_KEYS.SEARCH}=launch%20teaser`);
  });
});
