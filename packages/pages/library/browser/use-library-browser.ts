'use client';

import {
  IngredientCategory,
  LibraryPlace,
  PageScope,
  parseIngredientCategory,
} from '@genfeedai/contracts';
import {
  LIBRARY_QUERY_KEYS,
  LIBRARY_VIEW_MODES,
  type LibraryViewMode,
} from '@genfeedai/contracts/constants';
import type { IIngredientsContextValue } from '@genfeedai/contracts/interfaces/providers/providers.interface';
import type {
  IFilters,
  IFiltersState,
} from '@genfeedai/contracts/interfaces/utils/filters.interface';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type { LibraryBrowserProps } from '@props/pages/library-browser.props';
import { useUploadModal } from '@providers/global-modals/global-modals.provider';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';

import {
  LIBRARY_RECENT_SORT,
  LIBRARY_SORT_OPTIONS,
} from './library-browser.config';

/**
 * The unified list endpoint. `IngredientsService.getInstance('ingredients')`
 * hits `GET /ingredients`, which serves every category at once — the per-type
 * services (`videos`, `images`, …) each pin one category and cannot express the
 * type axis as a multi-select.
 */
const LIBRARY_INGREDIENT_TYPE = 'ingredients';

function parseCategories(values: string[]): IngredientCategory[] {
  const parsed = values
    .map((value) => parseIngredientCategory(value))
    .filter((value): value is IngredientCategory => Boolean(value));

  return Array.from(new Set(parsed));
}

function parseViewMode(value: string | null): LibraryViewMode {
  return LIBRARY_VIEW_MODES.find((mode) => mode === value) ?? 'grid';
}

/**
 * Drive the Library browser's three axes.
 *
 * `place` and `shelf` are the route — they are not editable here. `categories`,
 * `folder`, `search`, `sort` and `view` are the control plane and live in the
 * query string. Every URL write goes through `pushAxes`, which re-serializes
 * *all* of them together: writing one axis with a fresh `URLSearchParams` is how
 * the old layout silently dropped the other two.
 */
export function useLibraryBrowser({
  place,
  shelf,
  seededCategories,
  scope = PageScope.BRAND,
}: Pick<
  LibraryBrowserProps,
  'place' | 'shelf' | 'seededCategories' | 'scope'
>) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { brandId, organizationId } = useCollectionScope();
  const { openUpload } = useUploadModal();

  const urlCategories = useMemo(
    () =>
      parseCategories(
        searchParams?.getAll(LIBRARY_QUERY_KEYS.CATEGORIES) ?? [],
      ),
    [searchParams],
  );

  // A type-seeded route (`/library/videos`) pre-selects its chips, but only
  // until the operator touches them — once the URL carries the axis, the URL
  // wins, including when it deliberately carries nothing.
  const hasCategoryParam = Boolean(
    searchParams?.has(LIBRARY_QUERY_KEYS.CATEGORIES),
  );
  const categories = useMemo(
    () => (hasCategoryParam ? urlCategories : [...(seededCategories ?? [])]),
    [hasCategoryParam, urlCategories, seededCategories],
  );

  const folderId = searchParams?.get(LIBRARY_QUERY_KEYS.FOLDER) ?? '';
  const search = searchParams?.get(LIBRARY_QUERY_KEYS.SEARCH) ?? '';
  const viewMode = parseViewMode(
    searchParams?.get(LIBRARY_QUERY_KEYS.VIEW) ?? null,
  );

  const defaultSort =
    place === LibraryPlace.RECENT
      ? LIBRARY_RECENT_SORT
      : LIBRARY_SORT_OPTIONS[0].value;
  const sort = searchParams?.get(LIBRARY_QUERY_KEYS.SORT) ?? defaultSort;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const onRefreshCallbackRef = useRef<(() => void) | undefined>(undefined);

  const registerRefresh = useCallback((callback: () => void) => {
    onRefreshCallbackRef.current = callback;
  }, []);

  const handleRefresh = useCallback(() => {
    onRefreshCallbackRef.current?.();
  }, []);

  const pushAxes = useCallback(
    (next: {
      categories?: IngredientCategory[];
      folderId?: string;
      search?: string;
      sort?: string;
      viewMode?: LibraryViewMode;
    }) => {
      const nextCategories = next.categories ?? categories;
      const nextFolderId = next.folderId ?? folderId;
      const nextSearch = next.search ?? search;
      const nextSort = next.sort ?? sort;
      const nextViewMode = next.viewMode ?? viewMode;

      const params = new URLSearchParams();

      for (const category of nextCategories) {
        params.append(LIBRARY_QUERY_KEYS.CATEGORIES, category);
      }

      // An explicitly emptied type axis still has to reach the URL, otherwise
      // the seeded categories reappear on the next render and the chips look
      // like they refuse to clear.
      if (nextCategories.length === 0 && (seededCategories?.length ?? 0) > 0) {
        params.set(LIBRARY_QUERY_KEYS.CATEGORIES, '');
      }

      if (nextFolderId) {
        params.set(LIBRARY_QUERY_KEYS.FOLDER, nextFolderId);
      }

      if (nextSearch) {
        params.set(LIBRARY_QUERY_KEYS.SEARCH, nextSearch);
      }

      if (nextSort && nextSort !== defaultSort) {
        params.set(LIBRARY_QUERY_KEYS.SORT, nextSort);
      }

      if (nextViewMode !== 'grid') {
        params.set(LIBRARY_QUERY_KEYS.VIEW, nextViewMode);
      }

      const queryString = params.toString();
      const expectedSearch = queryString ? `?${queryString}` : '';

      if (window.location.search !== expectedSearch) {
        router.replace(`${pathname}${expectedSearch}`, { scroll: false });
      }
    },
    [
      categories,
      defaultSort,
      folderId,
      pathname,
      router,
      search,
      seededCategories,
      sort,
      viewMode,
    ],
  );

  /**
   * Replace the type axis from the multi-select dropdown. One option covers
   * several categories — an edited image is still an image — so the caller
   * expands groups before they arrive here.
   */
  const handleCategoriesChange = useCallback(
    (nextCategories: IngredientCategory[]) => {
      pushAxes({
        categories: Array.from(new Set(nextCategories)),
      });
    },
    [pushAxes],
  );

  const handleClearCategories = useCallback(() => {
    pushAxes({ categories: [] });
  }, [pushAxes]);

  const handleSearchChange = useCallback(
    (value: string) => {
      pushAxes({ search: value });
    },
    [pushAxes],
  );

  const handleSortChange = useCallback(
    (value: string) => {
      pushAxes({ sort: value });
    },
    [pushAxes],
  );

  const handleViewModeChange = useCallback(
    (value: LibraryViewMode) => {
      pushAxes({ viewMode: value });
    },
    [pushAxes],
  );

  const handleUpload = useCallback(() => {
    // One chip selected is an unambiguous upload target; anything else lands in
    // the generic bucket and the operator files it afterwards.
    const category =
      categories.length === 1 ? categories[0] : IngredientCategory.INGREDIENT;

    openUpload({
      category,
      onComplete: () => handleRefresh(),
      parentId: scope === PageScope.ORGANIZATION ? organizationId : brandId,
      parentModel: scope === PageScope.ORGANIZATION ? 'Organization' : 'Brand',
    });
  }, [brandId, categories, handleRefresh, openUpload, organizationId, scope]);

  /**
   * `filters` feeds the shared filter chrome; `query` is what actually reaches
   * the API through `useIngredientsLoading`. Status is deliberately absent — a
   * shelf owns the status axis server-side, and with no shelf the API applies
   * `LIBRARY_DEFAULT_STATUSES` itself.
   */
  const filters: IFiltersState = useMemo(
    () => ({
      brand: scope === PageScope.ORGANIZATION ? brandId : '',
      favorite: place === LibraryPlace.STARRED ? 'true' : '',
      folder: folderId,
      format: '',
      model: '',
      provider: '',
      search,
      sort,
      status: '',
      type: '',
    }),
    [brandId, folderId, place, scope, search, sort],
  );

  const query: IFilters = useMemo(() => {
    const next: IFilters = { sort };

    if (categories.length > 0) {
      next.categories = categories;
    }

    if (shelf) {
      next.shelf = shelf;
    }

    if (folderId) {
      next.folder = folderId;
    }

    if (search) {
      next.search = search;
    }

    if (place === LibraryPlace.STARRED) {
      next.isFavorite = 'true';
    }

    if (place === LibraryPlace.TRASH) {
      next.isDeleted = 'true';
    }

    return next;
  }, [categories, folderId, place, search, shelf, sort]);

  const contextValue: IIngredientsContextValue = useMemo(
    () => ({
      filters,
      ingredientType: LIBRARY_INGREDIENT_TYPE,
      isRefreshing,
      onRefresh: registerRefresh,
      query,
      setFilters: () => undefined,
      setIngredientType: () => undefined,
      setIsRefreshing,
      setQuery: () => undefined,
      viewMode,
      // The URL is the single source of truth for all three axes, so the
      // context's setters are inert by design — every mutation goes through
      // `pushAxes` and comes back as a re-render from `useSearchParams`.
    }),
    [filters, isRefreshing, query, registerRefresh, viewMode],
  );

  return {
    categories,
    contextValue,
    folderId,
    handleCategoriesChange,
    handleClearCategories,
    handleRefresh,
    handleSearchChange,
    handleSortChange,
    handleUpload,
    handleViewModeChange,
    isRefreshing,
    search,
    sort,
    viewMode,
  };
}
