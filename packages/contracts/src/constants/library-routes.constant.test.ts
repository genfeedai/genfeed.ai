import { describe, expect, it } from 'vitest';
import {
  IngredientCategory,
  LibraryPlace,
  LibraryShelf,
  TagMatchMode,
} from '..';

import {
  createLibraryBrowserRoute,
  createLibraryShelfRoute,
  LIBRARY_QUERY_KEYS,
  resolveLegacyLibraryRoute,
  resolveLibraryAxisRoute,
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

  it('repeats the characters key beside the other filters', () => {
    expect(
      createLibraryBrowserRoute(APP_ROUTES.LIBRARY.ASSETS, {
        categories: [IngredientCategory.IMAGE],
        characters: ['c1', 'c2'],
      }),
    ).toBe('/library/assets?categories=IMAGE&characters=c1&characters=c2');
  });

  it('repeats the tags key and carries the match mode so a filtered view can be shared', () => {
    expect(
      createLibraryBrowserRoute(APP_ROUTES.LIBRARY.ASSETS, {
        tagMatch: TagMatchMode.ALL,
        tags: ['t1', 't2'],
      }),
    ).toBe('/library/assets?tags=t1&tags=t2&tagMatch=all');
  });

  it('replaces tags already on the route instead of stacking them', () => {
    expect(
      createLibraryBrowserRoute('/library/assets?tags=old', { tags: ['new'] }),
    ).toBe('/library/assets?tags=new');
  });

  it('encodes search terms', () => {
    expect(
      createLibraryBrowserRoute(APP_ROUTES.LIBRARY.ASSETS, {
        search: 'launch teaser',
      }),
    ).toBe(`/library/assets?${LIBRARY_QUERY_KEYS.SEARCH}=launch+teaser`);
  });

  it('carries the view so a shared link keeps the layout', () => {
    expect(
      createLibraryBrowserRoute(APP_ROUTES.LIBRARY.ASSETS, {
        view: 'list',
      }),
    ).toBe(`/library/assets?${LIBRARY_QUERY_KEYS.VIEW}=list`);
  });
});

describe('resolveLibraryAxisRoute', () => {
  it('lets a place own the path and keeps categories as a param', () => {
    expect(
      resolveLibraryAxisRoute({
        categories: [IngredientCategory.IMAGE],
        place: LibraryPlace.TRASH,
      }),
    ).toEqual({ hasCategoriesInPath: false, route: '/library/trash' });
    expect(resolveLibraryAxisRoute({ place: LibraryPlace.RECENT }).route).toBe(
      '/library/recent',
    );
    expect(resolveLibraryAxisRoute({ place: LibraryPlace.STARRED }).route).toBe(
      '/library/starred',
    );
  });

  it('lets a shelf own the path before a type preset', () => {
    expect(
      resolveLibraryAxisRoute({
        categories: [IngredientCategory.GIF],
        shelf: LibraryShelf.APPROVED,
      }),
    ).toEqual({
      hasCategoriesInPath: false,
      route: '/library/shelf/approved',
    });
  });

  it('puts an exact type preset in the path, in any order', () => {
    expect(
      resolveLibraryAxisRoute({
        categories: [IngredientCategory.IMAGE_EDIT, IngredientCategory.IMAGE],
      }),
    ).toEqual({ hasCategoriesInPath: true, route: '/library/images' });
    expect(
      resolveLibraryAxisRoute({ categories: [IngredientCategory.AVATAR] })
        .route,
    ).toBe('/library/avatars');
  });

  it('falls back to All assets for anything without a route of its own', () => {
    expect(resolveLibraryAxisRoute({})).toEqual({
      hasCategoriesInPath: false,
      route: '/library/assets',
    });
    expect(
      resolveLibraryAxisRoute({
        categories: [IngredientCategory.IMAGE, IngredientCategory.VIDEO],
      }).route,
    ).toBe('/library/assets');
    expect(
      resolveLibraryAxisRoute({ categories: [IngredientCategory.IMAGE] }).route,
    ).toBe('/library/assets');
  });
});

describe('resolveLegacyLibraryRoute', () => {
  it.each([
    [{ place: 'trash' }, '/library/trash'],
    [{ place: 'recent', folder: 'f1' }, '/library/recent?folder=f1'],
    [{ shelf: 'needs-review' }, '/library/shelf/needs-review'],
    [
      { categories: ['IMAGE', 'IMAGE_EDIT'], search: 'hero' },
      '/library/images?search=hero',
    ],
    [{ categories: ['GIF'] }, '/library/gifs'],
  ])('moves %j to its route', (search, route) => {
    expect(resolveLegacyLibraryRoute(search)).toBe(route);
  });

  it('keeps the categories param when a place owns the path', () => {
    expect(
      resolveLegacyLibraryRoute({ categories: 'IMAGE', place: 'starred' }),
    ).toBe('/library/starred?categories=IMAGE');
  });

  it('strips a legacy axis that names no view', () => {
    expect(resolveLegacyLibraryRoute({ place: 'assets', folder: 'f1' })).toBe(
      '/library/assets?folder=f1',
    );
    expect(resolveLegacyLibraryRoute({ shelf: 'nope' })).toBe(
      '/library/assets',
    );
  });

  it('leaves canonical All assets URLs alone', () => {
    expect(resolveLegacyLibraryRoute({})).toBeNull();
    expect(
      resolveLegacyLibraryRoute({
        categories: ['IMAGE', 'VIDEO'],
        folder: 'f1',
      }),
    ).toBeNull();
    expect(resolveLegacyLibraryRoute({ categories: '' })).toBeNull();
  });
});
