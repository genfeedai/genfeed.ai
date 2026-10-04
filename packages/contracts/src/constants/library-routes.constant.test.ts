import { describe, expect, it } from 'vitest';
import { IngredientCategory, LibraryShelf, TagMatchMode } from '..';

import {
  createLibraryBrowserRoute,
  createLibraryShelfRoute,
  LIBRARY_QUERY_KEYS,
} from './library-routes.constant';
import { APP_ROUTES } from './routes.constant';

describe('createLibraryShelfRoute', () => {
  it('builds a shelf deep link from the lowercase product key', () => {
    expect(createLibraryShelfRoute(LibraryShelf.NEEDS_REVIEW)).toBe(
      '/library/assets?shelf=needs-review',
    );
  });

  it('keeps every shelf under the canonical shelf prefix', () => {
    expect(
      createLibraryShelfRoute(LibraryShelf.GENERATING).startsWith(
        `${APP_ROUTES.LIBRARY.ASSETS}?shelf=`,
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
    ).toBe('/library/assets?shelf=approved&categories=VIDEO&folder=folder-1');
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
