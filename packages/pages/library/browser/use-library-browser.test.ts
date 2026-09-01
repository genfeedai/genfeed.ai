import {
  IngredientCategory,
  LibraryPlace,
  LibraryShelf,
  PageScope,
} from '@genfeedai/enums';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockOpenUpload, mockReplace, state } = vi.hoisted(() => ({
  mockOpenUpload: vi.fn(),
  mockReplace: vi.fn(),
  state: { pathname: '/library/assets', search: '' },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(state.search),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'organization-1',
  }),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useUploadModal: () => ({ openUpload: mockOpenUpload }),
}));

import { useLibraryBrowser } from './use-library-browser';

/** The URL the hook pushed, minus the pathname. */
function lastPushedSearch(): string {
  const [href] = mockReplace.mock.calls.at(-1) ?? [];

  return String(href).replace(state.pathname, '');
}

describe('useLibraryBrowser', () => {
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
    state.search = '?categories=IMAGE&categories=IMAGE_EDIT';

    const { result } = renderHook(() => useLibraryBrowser({}));

    act(() => {
      result.current.handleCategoriesChange([
        IngredientCategory.VIDEO,
        IngredientCategory.VIDEO_EDIT,
      ]);
    });

    expect(
      new URLSearchParams(lastPushedSearch()).getAll('categories'),
    ).toEqual(['VIDEO', 'VIDEO_EDIT']);
  });

  it('leaves the default sort out of the URL', () => {
    const { result } = renderHook(() => useLibraryBrowser({}));

    act(() => {
      result.current.handleSearchChange('hero');
    });

    expect(lastPushedSearch()).toBe('?search=hero');
  });

  it('defaults Recent to most-recently-updated', () => {
    state.pathname = '/library/recent';

    const { result } = renderHook(() =>
      useLibraryBrowser({ place: LibraryPlace.RECENT }),
    );

    expect(result.current.sort).toBe('updatedAt: -1');
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
