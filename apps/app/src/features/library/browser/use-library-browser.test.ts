import {
  IngredientCategory,
  IngredientOrigin,
  LibraryPlace,
  LibraryShelf,
  PageScope,
  TagMatchMode,
} from '@genfeedai/contracts';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockOpenUpload, mockPush, mockReplace, state } = vi.hoisted(() => ({
  mockOpenUpload: vi.fn(),
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  state: { pathname: '/library/assets', search: '' },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(state.search),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'organization-1',
  }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/brand-x${path}` }),
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.hooks',
  () => ({
    useUploadModal: () => ({ openUpload: mockOpenUpload }),
  }),
);

import { useLibraryBrowser } from './use-library-browser';

/** The URL the hook pushed, minus the path. */
function lastPushedSearch(): string {
  const [href] = mockReplace.mock.calls.at(-1) ?? [];
  const query = String(href).split('?')[1];

  return query ? `?${query}` : '';
}

/** The route the hook last moved to, without its query. */
function lastPushedPath(): string {
  const [href] = mockReplace.mock.calls.at(-1) ?? [];

  return String(href).split('?')[0] ?? '';
}

describe('useLibraryBrowser', () => {
  it('takes place and shelf from the route and keeps the route when changing type', () => {
    state.pathname = '/library/shelf/approved';
    state.search = 'folder=f1&asset=a1&view=list&page=3';
    const { result } = renderHook(() =>
      useLibraryBrowser({ shelf: LibraryShelf.APPROVED }),
    );
    expect(result.current.contextValue.query).toMatchObject({
      shelf: 'approved',
      folder: 'f1',
    });
    act(() =>
      result.current.handleCategoriesChange([IngredientCategory.IMAGE]),
    );
    const next = new URLSearchParams(lastPushedSearch());
    expect(lastPushedPath()).toBe('/library/shelf/approved');
    expect(next.getAll('categories')).toEqual(['IMAGE']);
    expect(next.get('asset')).toBe('a1');
    expect(next.has('page')).toBe(false);
    expect(next.has('shelf')).toBe(false);
  });

  it('moves the admin Library between type paths and keeps the organization picker', () => {
    state.pathname = '/admin/content/ingredients';
    state.search = 'organization=org-9&brand=b-9&page=2';
    const { result } = renderHook(() =>
      useLibraryBrowser({ scope: PageScope.SUPERADMIN }),
    );

    act(() =>
      result.current.handleCategoriesChange([
        IngredientCategory.VIDEO,
        IngredientCategory.VIDEO_EDIT,
      ]),
    );
    expect(lastPushedPath()).toBe('/admin/content/ingredients/videos');
    const typed = new URLSearchParams(lastPushedSearch());
    expect(typed.get('organization')).toBe('org-9');
    expect(typed.get('brand')).toBe('b-9');
    expect(typed.has('categories')).toBe(false);
    expect(typed.has('page')).toBe(false);

    act(() =>
      result.current.handleCategoriesChange([
        IngredientCategory.VIDEO,
        IngredientCategory.IMAGE,
      ]),
    );
    expect(lastPushedPath()).toBe('/admin/content/ingredients');
    expect(
      new URLSearchParams(lastPushedSearch()).getAll('categories'),
    ).toEqual(['VIDEO', 'IMAGE']);
  });

  it('reads Starred and Trash from the route, not the query', () => {
    state.search = 'place=trash';
    const starred = renderHook(() =>
      useLibraryBrowser({ place: LibraryPlace.STARRED }),
    );
    expect(starred.result.current.contextValue.query.isFavorite).toBe('true');
    expect(starred.result.current.contextValue.query.isDeleted).toBeUndefined();
    expect(starred.result.current.contextValue.query.shelf).toBeUndefined();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    state.pathname = '/library/assets';
    state.search = '';
    window.history.replaceState(null, '', '/library/assets');
  });

  it('reads the type axis from repeated categories keys', () => {
    state.search = '?categories=IMAGE&categories=VIDEO';

    const { result } = renderHook(() => useLibraryBrowser({}));

    expect(result.current.categories).toEqual([
      IngredientCategory.IMAGE,
      IngredientCategory.VIDEO,
    ]);
    expect(result.current.contextValue.query.categories).toEqual([
      IngredientCategory.IMAGE,
      IngredientCategory.VIDEO,
    ]);
    expect(result.current.contextValue.viewMode).toBe('grid');
  });

  it('reads the origin filter from repeated origins keys and sends it to the list', () => {
    state.search = '?origins=UPLOADED&origins=imported&origins=bogus';

    const { result } = renderHook(() => useLibraryBrowser({}));

    expect(result.current.origins).toEqual([
      IngredientOrigin.UPLOADED,
      IngredientOrigin.IMPORTED,
    ]);
    expect(result.current.contextValue.query.origins).toEqual([
      IngredientOrigin.UPLOADED,
      IngredientOrigin.IMPORTED,
    ]);
  });

  it('keeps references out of All assets when no origin is selected', () => {
    const { result } = renderHook(() =>
      useLibraryBrowser({ place: LibraryPlace.ASSETS }),
    );

    expect(result.current.origins).toEqual([]);
    expect(result.current.contextValue.query.origins).toEqual([
      IngredientOrigin.GENERATED,
      IngredientOrigin.UNKNOWN,
    ]);
  });

  it('keeps references out of a type preset, which is All assets with chips', () => {
    const { result } = renderHook(() =>
      useLibraryBrowser({ seededCategories: [IngredientCategory.IMAGE] }),
    );

    expect(result.current.contextValue.query.origins).toEqual([
      IngredientOrigin.GENERATED,
      IngredientOrigin.UNKNOWN,
    ]);
  });

  it.each([
    ['a shelf', '', { shelf: LibraryShelf.REFERENCES }],
    ['a folder', '?folder=f1', { place: LibraryPlace.ASSETS }],
    ['Recent', '', { place: LibraryPlace.RECENT }],
    ['Starred', '', { place: LibraryPlace.STARRED }],
    ['Trash', '', { place: LibraryPlace.TRASH }],
  ])('sends no origin default inside %s', (_label, search, props) => {
    state.search = search;

    const { result } = renderHook(() => useLibraryBrowser(props));

    expect(result.current.contextValue.query).not.toHaveProperty('origins');
  });

  it('composes origin with type, shelf and folder instead of replacing them', () => {
    state.search = '?categories=IMAGE&folder=f1&origins=UPLOADED';

    const { result } = renderHook(() =>
      useLibraryBrowser({ shelf: LibraryShelf.APPROVED }),
    );

    expect(result.current.contextValue.query).toMatchObject({
      categories: [IngredientCategory.IMAGE],
      folder: 'f1',
      origins: [IngredientOrigin.UPLOADED],
      shelf: 'approved',
    });
  });

  it('reads repeated characters from the URL into the API query', () => {
    state.search = '?characters=c1&characters=c2&characters=c1';

    const { result } = renderHook(() => useLibraryBrowser({}));

    expect(result.current.characters).toEqual(['c1', 'c2']);
    expect(result.current.contextValue.query.characters).toEqual(['c1', 'c2']);
  });

  it('never reads more characters from the URL than the API accepts', () => {
    state.search = Array.from(
      { length: 30 },
      (_, index) => `characters=c${index}`,
    ).join('&');

    const { result } = renderHook(() => useLibraryBrowser({}));

    expect(result.current.characters).toHaveLength(25);
  });

  it('sends no characters when none are selected', () => {
    const { result } = renderHook(() => useLibraryBrowser({}));

    expect(result.current.characters).toEqual([]);
    expect(result.current.contextValue.query).not.toHaveProperty('characters');
  });

  it('writes characters to the URL without dropping the other axes', () => {
    state.search =
      '?categories=IMAGE&origins=GENERATED&folder=f1&search=hero&page=2';

    const { result } = renderHook(() => useLibraryBrowser({}));
    act(() => result.current.handleCharactersChange(['c1', 'c2', 'c1']));

    const next = new URLSearchParams(lastPushedSearch());
    expect(next.getAll('characters')).toEqual(['c1', 'c2']);
    expect(next.getAll('categories')).toEqual(['IMAGE']);
    expect(next.getAll('origins')).toEqual(['GENERATED']);
    expect(next.get('folder')).toBe('f1');
    expect(next.get('search')).toBe('hero');
    expect(next.has('page')).toBe(false);
  });

  it('clears characters without touching other axes', () => {
    state.search = '?characters=c1&origins=UPLOADED';

    const { result } = renderHook(() => useLibraryBrowser({}));
    act(() => result.current.handleCharactersChange([]));

    const next = new URLSearchParams(lastPushedSearch());
    expect(next.has('characters')).toBe(false);
    expect(next.getAll('origins')).toEqual(['UPLOADED']);
  });

  it('clears every filter at once and keeps sort, view, folder and search', () => {
    state.search =
      '?categories=VIDEO&origins=UPLOADED&characters=c1&tags=t1&shelf=approved&place=starred&folder=f1&search=hero&sort=label%3A+1&view=list';

    const { result } = renderHook(() => useLibraryBrowser({}));
    act(() => result.current.handleClearAllFilters());

    const next = new URLSearchParams(lastPushedSearch());
    for (const key of [
      'categories',
      'origins',
      'characters',
      'tags',
      'shelf',
      'place',
    ]) {
      expect(next.has(key)).toBe(false);
    }
    expect(next.get('folder')).toBe('f1');
    expect(next.get('search')).toBe('hero');
    expect(next.get('sort')).toBe('label: 1');
    expect(next.get('view')).toBe('list');
  });

  it('writes origin to the URL without dropping the other axes', () => {
    state.search = '?categories=IMAGE&folder=f1&search=hero&page=2';

    const { result } = renderHook(() => useLibraryBrowser({}));
    act(() =>
      result.current.handleOriginsChange([
        IngredientOrigin.GENERATED,
        IngredientOrigin.GENERATED,
        IngredientOrigin.IMPORTED,
      ]),
    );

    const next = new URLSearchParams(lastPushedSearch());
    expect(next.getAll('origins')).toEqual(['GENERATED', 'IMPORTED']);
    expect(next.getAll('categories')).toEqual(['IMAGE']);
    expect(next.get('folder')).toBe('f1');
    expect(next.get('search')).toBe('hero');
    expect(next.has('page')).toBe(false);
  });

  it('keeps origin when another axis changes and clears only itself', () => {
    state.search = '?origins=UPLOADED';

    const { result } = renderHook(() => useLibraryBrowser({}));
    act(() =>
      result.current.handleCategoriesChange([IngredientCategory.VIDEO]),
    );
    expect(new URLSearchParams(lastPushedSearch()).getAll('origins')).toEqual([
      'UPLOADED',
    ]);

    state.search = '?categories=VIDEO&origins=UPLOADED';
    const { result: second } = renderHook(() => useLibraryBrowser({}));
    act(() => second.current.handleOriginsChange([]));

    const cleared = new URLSearchParams(lastPushedSearch());
    expect(cleared.has('origins')).toBe(false);
    expect(cleared.getAll('categories')).toEqual(['VIDEO']);
  });

  describe('tags', () => {
    it('reads repeated tags from the URL into the API query', () => {
      state.search = '?tags=t1&tags=t2&tags=t1';

      const { result } = renderHook(() => useLibraryBrowser({}));

      expect(result.current.tags).toEqual(['t1', 't2']);
      expect(result.current.contextValue.query.tags).toEqual(['t1', 't2']);
    });

    it('never reads more tags from the URL than the API accepts', () => {
      state.search = Array.from(
        { length: 30 },
        (_, index) => `tags=t${index}`,
      ).join('&');

      const { result } = renderHook(() => useLibraryBrowser({}));

      expect(result.current.tags).toHaveLength(25);
    });

    it('sends no tags and no match mode when none are selected', () => {
      state.search = '?tagMatch=all';

      const { result } = renderHook(() => useLibraryBrowser({}));

      expect(result.current.tags).toEqual([]);
      expect(result.current.contextValue.query).not.toHaveProperty('tags');
      expect(result.current.contextValue.query).not.toHaveProperty('tagMatch');
    });

    it('defaults to any and sends all only when asked for beside several tags', () => {
      state.search = '?tags=t1&tags=t2';
      const { result: any } = renderHook(() => useLibraryBrowser({}));
      expect(any.current.tagMatch).toBe(TagMatchMode.ANY);
      expect(any.current.contextValue.query).not.toHaveProperty('tagMatch');

      state.search = '?tags=t1&tags=t2&tagMatch=ALL';
      const { result: all } = renderHook(() => useLibraryBrowser({}));
      expect(all.current.tagMatch).toBe(TagMatchMode.ALL);
      expect(all.current.contextValue.query.tagMatch).toBe(TagMatchMode.ALL);

      // One tag has nothing to combine, so the mode is never sent.
      state.search = '?tags=t1&tagMatch=all';
      const { result: single } = renderHook(() => useLibraryBrowser({}));
      expect(single.current.contextValue.query).not.toHaveProperty('tagMatch');
    });

    it('writes tags to the URL without dropping the other axes', () => {
      state.search =
        '?categories=IMAGE&origins=GENERATED&characters=c1&folder=f1&search=hero&page=2';

      const { result } = renderHook(() => useLibraryBrowser({}));
      act(() => result.current.handleTagsChange(['t1', 't2', 't1']));

      const next = new URLSearchParams(lastPushedSearch());
      expect(next.getAll('tags')).toEqual(['t1', 't2']);
      expect(next.getAll('categories')).toEqual(['IMAGE']);
      expect(next.getAll('origins')).toEqual(['GENERATED']);
      expect(next.getAll('characters')).toEqual(['c1']);
      expect(next.get('folder')).toBe('f1');
      expect(next.get('search')).toBe('hero');
      expect(next.has('page')).toBe(false);
    });

    it('writes the match mode only beside several tags', () => {
      state.search = '?tags=t1&tags=t2';

      const { result } = renderHook(() => useLibraryBrowser({}));
      act(() => result.current.handleTagMatchChange(TagMatchMode.ALL));

      const next = new URLSearchParams(lastPushedSearch());
      expect(next.getAll('tags')).toEqual(['t1', 't2']);
      expect(next.get('tagMatch')).toBe('all');

      state.search = '?tags=t1&tagMatch=all';
      const { result: single } = renderHook(() => useLibraryBrowser({}));
      act(() => single.current.handleTagsChange(['t1']));
      expect(new URLSearchParams(lastPushedSearch()).has('tagMatch')).toBe(
        false,
      );
    });

    it('keeps tags when another axis changes and clears only itself', () => {
      state.search = '?tags=t1&tagMatch=all&tags=t2';

      const { result } = renderHook(() => useLibraryBrowser({}));
      act(() =>
        result.current.handleCategoriesChange([IngredientCategory.VIDEO]),
      );
      const kept = new URLSearchParams(lastPushedSearch());
      expect(kept.getAll('tags')).toEqual(['t1', 't2']);
      expect(kept.get('tagMatch')).toBe('all');

      state.search = '?categories=VIDEO&tags=t1&tags=t2&tagMatch=all';
      const { result: second } = renderHook(() => useLibraryBrowser({}));
      act(() => second.current.handleTagsChange([]));

      const cleared = new URLSearchParams(lastPushedSearch());
      expect(cleared.has('tags')).toBe(false);
      expect(cleared.has('tagMatch')).toBe(false);
      expect(cleared.getAll('categories')).toEqual(['VIDEO']);
    });
  });

  it('puts the selected view in the shared list context', () => {
    state.search = '?view=list';

    const { result } = renderHook(() => useLibraryBrowser({}));

    expect(result.current.contextValue.viewMode).toBe('list');
  });

  it('seeds the type axis from the route until the URL carries it', () => {
    const seeded = [IngredientCategory.VIDEO, IngredientCategory.VIDEO_EDIT];

    const { result, rerender } = renderHook(() =>
      useLibraryBrowser({ seededCategories: seeded }),
    );

    expect(result.current.categories).toEqual(seeded);

    // An explicitly emptied axis is a real state, not "unset" — the seed must
    // not creep back in.
    state.search = '?categories=';
    rerender();

    expect(result.current.categories).toEqual([]);
  });

  it('keeps every axis when one of them changes', () => {
    state.search = '?categories=IMAGE&folder=folder-1&search=hero&view=list';

    const { result } = renderHook(() => useLibraryBrowser({}));

    act(() => {
      result.current.handleSortChange('label: 1');
    });

    const pushed = new URLSearchParams(lastPushedSearch());

    expect(pushed.getAll('categories')).toEqual(['IMAGE']);
    expect(pushed.get('folder')).toBe('folder-1');
    expect(pushed.get('search')).toBe('hero');
    expect(pushed.get('view')).toBe('list');
    expect(pushed.get('sort')).toBe('label: 1');
  });

  it('replaces the type axis from the dropdown selection', () => {
    state.search = '?categories=IMAGE&categories=VIDEO';

    const { result } = renderHook(() => useLibraryBrowser({}));

    act(() => {
      result.current.handleCategoriesChange([
        IngredientCategory.VIDEO,
        IngredientCategory.GIF,
      ]);
    });

    expect(lastPushedPath()).toBe('/library/assets');
    expect(
      new URLSearchParams(lastPushedSearch()).getAll('categories'),
    ).toEqual(['VIDEO', 'GIF']);
  });

  it('moves to the type route when the selection is exactly that type', () => {
    state.search = '?folder=f1&view=list';

    const { result } = renderHook(() => useLibraryBrowser({}));

    act(() => {
      result.current.handleCategoriesChange([
        IngredientCategory.VIDEO,
        IngredientCategory.VIDEO_EDIT,
      ]);
    });

    expect(lastPushedPath()).toBe('/library/videos');
    const next = new URLSearchParams(lastPushedSearch());
    expect(next.has('categories')).toBe(false);
    expect(next.get('folder')).toBe('f1');
    expect(next.get('view')).toBe('list');
  });

  it('returns to All assets when the type route is cleared', () => {
    state.pathname = '/library/images';
    state.search = '?folder=f1';
    const seeded = [IngredientCategory.IMAGE, IngredientCategory.IMAGE_EDIT];

    const { result } = renderHook(() =>
      useLibraryBrowser({ seededCategories: seeded }),
    );

    act(() => {
      result.current.handleCategoriesChange([]);
    });

    expect(lastPushedPath()).toBe('/library/assets');
    const next = new URLSearchParams(lastPushedSearch());
    expect(next.has('categories')).toBe(false);
    expect(next.get('folder')).toBe('f1');
  });

  it('keeps the type chips as filters on a place route', () => {
    state.pathname = '/library/images';
    state.search = '';
    const seeded = [IngredientCategory.IMAGE, IngredientCategory.IMAGE_EDIT];

    const { result } = renderHook(() =>
      useLibraryBrowser({ seededCategories: seeded }),
    );

    act(() => {
      result.current.handlePlaceChange(LibraryPlace.RECENT);
    });

    expect(lastPushedPath()).toBe('/library/recent');
    expect(
      new URLSearchParams(lastPushedSearch()).getAll('categories'),
    ).toEqual(['IMAGE', 'IMAGE_EDIT']);
  });

  it('leaves the default sort out of the URL', () => {
    const { result } = renderHook(() => useLibraryBrowser({}));

    act(() => {
      result.current.handleSearchChange('hero');
    });

    expect(lastPushedSearch()).toBe('?search=hero&view=grid');
  });

  it('writes the selected view into the URL so a shared link keeps the layout', () => {
    const { result } = renderHook(() => useLibraryBrowser({}));

    act(() => {
      result.current.handleViewModeChange('list');
    });

    expect(lastPushedSearch()).toBe('?view=list');

    act(() => {
      result.current.handleViewModeChange('canvas');
    });

    expect(lastPushedSearch()).toBe('?view=canvas');
  });

  it('keeps contact sheet in the URL when switching back to grid', () => {
    state.search = '?view=list';

    const { result } = renderHook(() => useLibraryBrowser({}));

    act(() => {
      result.current.handleViewModeChange('grid');
    });

    expect(lastPushedSearch()).toBe('?view=grid');
  });

  it('defaults Recent to most-recently-updated', () => {
    state.pathname = '/library/recent';

    const { result } = renderHook(() =>
      useLibraryBrowser({ place: LibraryPlace.RECENT }),
    );

    expect(result.current.sort).toBe('updatedAt: -1');
  });

  it('moves from Recent to the shelf when the status filter selects one', () => {
    state.pathname = '/library/recent';
    state.search = 'view=grid';

    const { result } = renderHook(() =>
      useLibraryBrowser({ place: LibraryPlace.RECENT }),
    );

    act(() => {
      result.current.handleStatusChange(LibraryShelf.FAILED);
    });

    expect(lastPushedPath()).toBe('/library/shelf/failed');
    const next = new URLSearchParams(lastPushedSearch());
    expect(next.has('place')).toBe(false);
    expect(next.has('shelf')).toBe(false);
    expect(next.get('view')).toBe('grid');
  });

  it('switches places by route, leaving Trash and a shelf (#5502)', () => {
    state.pathname = '/library/trash';
    state.search = 'view=grid';
    const fromTrash = renderHook(() =>
      useLibraryBrowser({ place: LibraryPlace.TRASH }),
    );
    act(() => {
      fromTrash.result.current.handlePlaceChange(LibraryPlace.STARRED);
    });
    expect(lastPushedPath()).toBe('/library/starred');

    state.pathname = '/library/recent';
    const recent = renderHook(() =>
      useLibraryBrowser({ place: LibraryPlace.RECENT }),
    );
    act(() => {
      recent.result.current.handlePlaceChange(null);
    });
    expect(lastPushedPath()).toBe('/library/assets');
    expect(new URLSearchParams(lastPushedSearch()).get('view')).toBe('grid');

    state.pathname = '/library/shelf/failed';
    const shelved = renderHook(() =>
      useLibraryBrowser({ shelf: LibraryShelf.FAILED }),
    );
    act(() => {
      shelved.result.current.handlePlaceChange(LibraryPlace.RECENT);
    });
    expect(lastPushedPath()).toBe('/library/recent');
  });

  it('treats Trash and a shelf as mutually exclusive', () => {
    state.pathname = '/library/shelf/failed';
    state.search = 'view=grid';

    const selected = renderHook(() =>
      useLibraryBrowser({ shelf: LibraryShelf.FAILED }),
    );
    act(() => {
      selected.result.current.handleStatusChange('trash');
    });
    expect(lastPushedPath()).toBe('/library/trash');

    state.pathname = '/library/trash';
    const cleared = renderHook(() =>
      useLibraryBrowser({ place: LibraryPlace.TRASH }),
    );
    act(() => {
      cleared.result.current.handleStatusChange(null);
    });
    expect(lastPushedPath()).toBe('/library/assets');
    expect(new URLSearchParams(lastPushedSearch()).get('view')).toBe('grid');
  });

  it('sends the shelf as its own axis and never a status filter', () => {
    state.pathname = '/library/shelf/needs-review';

    const { result } = renderHook(() =>
      useLibraryBrowser({ shelf: LibraryShelf.NEEDS_REVIEW }),
    );

    expect(result.current.contextValue.query.shelf).toBe('needs-review');
    expect(result.current.contextValue.query.status).toBeUndefined();
  });

  it('turns places into the flags the API understands', () => {
    const starred = renderHook(() =>
      useLibraryBrowser({ place: LibraryPlace.STARRED }),
    );
    expect(starred.result.current.contextValue.query.isFavorite).toBe('true');
    expect(starred.result.current.contextValue.query.isDeleted).toBeUndefined();

    const trash = renderHook(() =>
      useLibraryBrowser({ place: LibraryPlace.TRASH }),
    );
    expect(trash.result.current.contextValue.query.isDeleted).toBe('true');
  });

  it('uploads into the selected chip only when it is unambiguous', () => {
    state.search = '?categories=GIF';
    const single = renderHook(() => useLibraryBrowser({}));

    act(() => {
      single.result.current.handleUpload();
    });

    expect(mockOpenUpload).toHaveBeenLastCalledWith(
      expect.objectContaining({ category: IngredientCategory.GIF }),
    );

    state.search = '?categories=GIF&categories=IMAGE';
    const multiple = renderHook(() => useLibraryBrowser({}));

    act(() => {
      multiple.result.current.handleUpload();
    });

    expect(mockOpenUpload).toHaveBeenLastCalledWith(
      expect.objectContaining({ category: IngredientCategory.INGREDIENT }),
    );
  });

  it('follows an upload from All assets to the Imported page', () => {
    state.search = '?categories=IMAGE&view=list&page=2';
    const { result } = renderHook(() =>
      useLibraryBrowser({ place: LibraryPlace.ASSETS }),
    );

    act(() => {
      result.current.handleUpload();
    });
    act(() => {
      mockOpenUpload.mock.lastCall?.[0].onComplete();
    });

    expect(mockPush).toHaveBeenCalledWith(
      '/acme/brand-x/library/imported?categories=IMAGE&view=list',
      { scroll: false },
    );
  });

  it('lists only the seeded origins on the Imported page and refreshes in place after an upload', () => {
    const seededOrigins = [
      IngredientOrigin.UPLOADED,
      IngredientOrigin.IMPORTED,
    ];
    const { result } = renderHook(() =>
      useLibraryBrowser({ place: LibraryPlace.ASSETS, seededOrigins }),
    );

    expect(result.current.contextValue.query.origins).toEqual(seededOrigins);

    act(() => {
      result.current.handleUpload();
    });
    act(() => {
      mockOpenUpload.mock.lastCall?.[0].onComplete();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('lets an origin the operator picks narrow the seeded origins', () => {
    state.search = '?origins=UPLOADED';
    const { result } = renderHook(() =>
      useLibraryBrowser({
        seededOrigins: [IngredientOrigin.UPLOADED, IngredientOrigin.IMPORTED],
      }),
    );

    expect(result.current.contextValue.query.origins).toEqual([
      IngredientOrigin.UPLOADED,
    ]);
  });

  it('refreshes in place after an upload from a view that shows references', () => {
    state.pathname = '/library/shelf/references';
    const { result } = renderHook(() =>
      useLibraryBrowser({ shelf: LibraryShelf.REFERENCES }),
    );

    act(() => {
      result.current.handleUpload();
    });
    act(() => {
      mockOpenUpload.mock.lastCall?.[0].onComplete();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('uploads against the organization when no brand is selected', () => {
    state.pathname = '/acme/~/library/assets';

    const { result } = renderHook(() =>
      useLibraryBrowser({ scope: PageScope.ORGANIZATION }),
    );

    act(() => {
      result.current.handleUpload();
    });

    expect(mockOpenUpload).toHaveBeenLastCalledWith(
      expect.objectContaining({
        parentId: 'organization-1',
        parentModel: 'Organization',
      }),
    );
  });
});
