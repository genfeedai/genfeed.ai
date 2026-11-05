'use client';

import {
  IngredientCategory,
  IngredientStatus,
  LibraryShelf,
  PageScope,
  parseIngredientCategory,
} from '@genfeedai/contracts';
import {
  ITEMS_PER_PAGE,
  LIBRARY_ASSETS_REFRESH_EVENT,
} from '@genfeedai/contracts/constants';
import type {
  IFilters,
  IFolder,
  IIngredient,
  IPaginatedResponse,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import type { Ingredient } from '@genfeedai/models/content/ingredient.model';
import { FoldersService } from '@genfeedai/services/content/folders.service';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import {
  isCancelledRequest,
  isServiceOperationError,
  normalizeOperationError,
} from '@genfeedai/services/core/operation-error';
import {
  createCacheKey,
  createLocalStorageCache,
} from '@helpers/data/cache/cache.helper';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import {
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { libraryAssetsRefreshIncludesList } from '@/features/ingredients/hooks/library-assets-refresh';

const INGREDIENTS_CACHE_TTL_MS = 15 * 60 * 1000;
const EMPTY_INGREDIENTS: IIngredient[] = [];
const EMPTY_FOLDERS: IFolder[] = [];

/** Where the next Library page starts: a keyset cursor, or a page number for orders the API cannot keyset-page. */
type IngredientsNextPage = { cursor: string } | { page: number } | null;

/**
 * One cached Library list: the rows loaded so far (first page plus every
 * "load more" page) and where the next page starts.
 */
interface IngredientsListData {
  items: IIngredient[];
  listQuery: IQueryParams | null;
  nextPage: IngredientsNextPage;
}

/** The last-good rows kept in localStorage, shown when the API is down. */
interface IngredientsOfflineFallback {
  cachedAt: string | null;
  cacheKey: string;
  items: IIngredient[];
}

function resolveNextPage(
  result: IPaginatedResponse<Ingredient>,
): IngredientsNextPage {
  if (result.nextCursor) {
    return { cursor: result.nextCursor };
  }
  if (result.nextCursor === undefined && result.hasNext) {
    return { page: result.page + 1 };
  }
  return null;
}

function appendUniqueIngredients(
  current: IIngredient[],
  next: IIngredient[],
): IIngredient[] {
  const seen = new Set(current.map((ingredient) => ingredient.id));
  const additions = next.filter((ingredient) => !seen.has(ingredient.id));
  return additions.length > 0 ? [...current, ...additions] : current;
}

function isIgnoredLibraryFailure(
  error: unknown,
  signal?: AbortSignal,
): boolean {
  return (
    signal?.aborted === true ||
    isCancelledRequest(error) ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function reportLibraryOperationFailure(
  operation: string,
  error: unknown,
): Error & { category?: string } {
  const normalized = isServiceOperationError(error)
    ? error
    : normalizeOperationError(operation, error);

  logger.error(`${operation} failed`, {
    error: normalized,
    reportToSentry: true,
    tags: {
      error_category: normalized.category ?? 'service_operation',
      operation,
      surface: 'library',
    },
  });

  return normalized;
}

function sanitizeQueryParams(queryParams: IQueryParams): IQueryParams {
  return Object.entries(queryParams).reduce<IQueryParams>(
    (acc, [key, value]) => {
      if (value === undefined || value === null) {
        return acc;
      }

      if (Array.isArray(value)) {
        const sanitizedArray = value.filter((item) => {
          if (item === undefined || item === null) {
            return false;
          }

          return typeof item !== 'string' || item.trim() !== '';
        });

        if (sanitizedArray.length > 0) {
          acc[key as keyof IQueryParams] = sanitizedArray;
        }

        return acc;
      }

      if (typeof value === 'string' && value.trim() === '') {
        return acc;
      }

      acc[key as keyof IQueryParams] = value;
      return acc;
    },
    {},
  );
}

interface IngredientsListParamsInput {
  adminBrand: string;
  adminOrganization: string;
  brandId?: string | null;
  currentPage: number;
  formatFilter?: string;
  organizationId?: string | null;
  query: IFilters;
  scope: PageScope;
  singularType: string;
  type: string;
}

/** The list request for the current scope, filters and page. */
function buildIngredientsListParams({
  adminBrand,
  adminOrganization,
  brandId,
  currentPage,
  formatFilter,
  organizationId,
  query,
  scope,
  singularType,
  type,
}: IngredientsListParamsInput): IQueryParams {
  let queryParams: IQueryParams = {
    ...query,
    limit: ITEMS_PER_PAGE * 2,
    page: currentPage,
  };

  if (scope === PageScope.BRAND && brandId) {
    const resolvedBrandId =
      typeof query.brand === 'string' && query.brand.trim() !== ''
        ? query.brand
        : brandId;
    if (resolvedBrandId) {
      queryParams.brand = resolvedBrandId;
    }
  } else if (scope === PageScope.ORGANIZATION && organizationId) {
    // Same endpoint and query as a brand; `allBrands` only widens the
    // brand axis to every brand in the organization.
    queryParams.allBrands = true;
  }
  if (scope === PageScope.SUPERADMIN) {
    // Platform admins see every organization unless the subbar picker
    // narrows to one; the API refuses `allOrganizations` for anyone else.
    if (adminOrganization) {
      queryParams.organizationId = adminOrganization;
    } else {
      queryParams.allOrganizations = true;
    }
    if (adminBrand) {
      queryParams.brandId = adminBrand;
    }
    const adminCategory = parseIngredientCategory(singularType);
    if (type !== 'ingredients' && adminCategory) {
      queryParams.categories = [adminCategory];
    }
  }

  if (Array.isArray(queryParams.status) && queryParams.status.length === 0) {
    delete queryParams.status;
  }

  if (formatFilter) {
    queryParams.format = formatFilter;
  }

  const isMediaList =
    singularType === IngredientCategory.VIDEO ||
    singularType === IngredientCategory.IMAGE ||
    singularType === IngredientCategory.GIF;
  if (isMediaList) {
    queryParams.lightweight = true;
  }

  if (
    singularType === IngredientCategory.VOICE ||
    singularType === IngredientCategory.MUSIC
  ) {
    queryParams = {
      ...queryParams,
      isDefault: true,
      status: queryParams.status || IngredientStatus.UPLOADED,
    };
  }

  return sanitizeQueryParams(queryParams);
}

interface UseIngredientsLoadingProps {
  type: string;
  scope: PageScope;
  brandId?: string | null;
  organizationId?: string | null;
  singularType: string;
  formatFilter?: string;
  currentPage: number;
  query: IFilters;
  setIsRefreshing: (isRefreshing: boolean) => void;
  onRefresh?: (fn: () => void) => void;
  parsedSearchParams: URLSearchParams;
  loadFolders: boolean;
  /**
   * False while the organization and brand are still resolving. A brand list
   * stays loading until then, so the empty state never paints first.
   */
  isScopeReady: boolean;
}

/**
 * The Library list and its folders, read through React Query: coming back to
 * a Library page paints the rows it showed last time and refreshes them in the
 * background, instead of starting from the skeleton again.
 */
export function useIngredientsLoading({
  type,
  scope,
  brandId,
  organizationId,
  singularType,
  formatFilter,
  currentPage,
  query,
  setIsRefreshing,
  onRefresh,
  parsedSearchParams,
  loadFolders,
  isScopeReady,
}: UseIngredientsLoadingProps) {
  const notificationsService = NotificationsService.getInstance();
  const queryClient = useQueryClient();

  // The admin library reads the unified `/ingredients` list for every tab, so
  // the all-organizations view and the type tabs share one endpoint and one
  // keyset pager; the type becomes a `categories` filter below.
  const serviceType = scope === PageScope.SUPERADMIN ? 'ingredients' : type;
  const getIngredientsService = useAuthedService((token) =>
    IngredientsService.getInstance(serviceType, token),
  );
  const adminOrganization =
    scope === PageScope.SUPERADMIN
      ? parsedSearchParams.get('organization') || ''
      : '';
  const adminBrand =
    scope === PageScope.SUPERADMIN ? parsedSearchParams.get('brand') || '' : '';

  const getBulkIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const shouldLoadData =
    scope === PageScope.SUPERADMIN ||
    scope === PageScope.ORGANIZATION ||
    (scope === PageScope.BRAND && Boolean(brandId));

  const listParams = useMemo(
    () =>
      buildIngredientsListParams({
        adminBrand,
        adminOrganization,
        brandId,
        currentPage,
        formatFilter,
        organizationId,
        query,
        scope,
        singularType,
        type,
      }),
    [
      adminBrand,
      adminOrganization,
      brandId,
      currentPage,
      formatFilter,
      organizationId,
      query,
      scope,
      singularType,
      type,
    ],
  );

  const listQueryKey = useMemo<QueryKey>(
    () => [
      'library-ingredients',
      type,
      scope,
      organizationId ?? null,
      brandId ?? null,
      listParams,
    ],
    [brandId, listParams, organizationId, scope, type],
  );
  const listQueryKeyRef = useRef(listQueryKey);
  listQueryKeyRef.current = listQueryKey;

  const offlineCacheKey = useMemo(
    () =>
      createCacheKey(
        type,
        scope,
        brandId ?? 'none',
        organizationId ?? 'none',
        JSON.stringify(listParams),
      ),
    [brandId, listParams, organizationId, scope, type],
  );

  const ingredientsCache = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    return createLocalStorageCache<IIngredient[]>({
      prefix: 'ingredients:list:',
    });
  }, []);

  const ingredientsCacheMeta = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    return createLocalStorageCache<string>({
      prefix: 'ingredients:list:meta:',
    });
  }, []);

  // Every first-page read starts a new list, so a "load more" page still in
  // flight for the previous list is dropped instead of appended.
  const loadSequenceRef = useRef(0);
  const loadMoreControllerRef = useRef<AbortController | null>(null);
  const [isLoadingMoreIngredients, setIsLoadingMoreIngredients] =
    useState(false);
  // Local edits (archive, review, delete) to the offline fallback rows.
  const [fallbackEdits, setFallbackEdits] =
    useState<IngredientsOfflineFallback | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(
    (parsedSearchParams.get('folder') as string) || undefined,
  );

  const socketSubscriptionsRef = useRef<Array<() => void>>([]);

  const url = `GET /${type}`;

  const listQuery = useAuthedQuery<IngredientsService, IngredientsListData>({
    enabled: shouldLoadData,
    queryFn: async (service, signal) => {
      loadSequenceRef.current += 1;
      loadMoreControllerRef.current?.abort();
      loadMoreControllerRef.current = null;
      setIsLoadingMoreIngredients(false);

      const isRecoveryShelf =
        scope === PageScope.BRAND && query.shelf === LibraryShelf.FAILED;
      let data: IngredientsListData;
      if (isRecoveryShelf) {
        data = {
          items: await service.findAllPages(listParams, signal),
          listQuery: null,
          nextPage: null,
        };
      } else {
        // Keyset pages: no per-page count, and older assets stay as cheap
        // to reach as the newest. Orders the API cannot keyset-page come
        // back with page-number links instead.
        const pageQuery: IQueryParams = { ...listParams, paging: 'cursor' };
        const result = await service.findAllPage(pageQuery, signal);
        data = {
          items: result.items,
          listQuery: pageQuery,
          nextPage: resolveNextPage(result),
        };
      }

      logger.info(`${url} success`, { count: data.items.length });
      ingredientsCache?.set(
        offlineCacheKey,
        data.items,
        INGREDIENTS_CACHE_TTL_MS,
      );
      ingredientsCacheMeta?.set(
        offlineCacheKey,
        new Date().toISOString(),
        INGREDIENTS_CACHE_TTL_MS,
      );
      return data;
    },
    queryKey: listQueryKey,
    service: (token: string) =>
      IngredientsService.getInstance(serviceType, token),
  });

  const {
    data: listData,
    error: listError,
    errorUpdatedAt: listErrorUpdatedAt,
    isError: isListError,
    isPending: isListPending,
    refetch: refetchList,
  } = listQuery;
  const hasListData = listData !== undefined;

  // A failed read with no rows to keep shows the last-good rows from
  // localStorage when there are any, else the error.
  const offlineFallback = useMemo<IngredientsOfflineFallback | null>(() => {
    if (!isListError || hasListData) {
      return null;
    }
    const cached = ingredientsCache?.get(offlineCacheKey) ?? [];
    return cached.length > 0
      ? {
          cachedAt: ingredientsCacheMeta?.get(offlineCacheKey) ?? null,
          cacheKey: offlineCacheKey,
          items: cached,
        }
      : null;
  }, [
    hasListData,
    ingredientsCache,
    ingredientsCacheMeta,
    isListError,
    offlineCacheKey,
  ]);
  const activeFallback =
    offlineFallback && fallbackEdits?.cacheKey === offlineCacheKey
      ? { ...offlineFallback, items: fallbackEdits.items }
      : offlineFallback;
  const hasLoadFailed =
    isListError &&
    !hasListData &&
    activeFallback === null &&
    !isIgnoredLibraryFailure(listError);
  const loadError = hasLoadFailed ? `Failed to load ${type}` : null;

  // A failed background refresh keeps the rows on screen and is only
  // reported; a failed first read with nothing to show also tells the user.
  // biome-ignore lint/correctness/useExhaustiveDependencies: listErrorUpdatedAt marks each new failed read.
  useEffect(() => {
    if (!isListError || isIgnoredLibraryFailure(listError)) {
      return;
    }
    if (hasListData) {
      reportLibraryOperationFailure(url, listError);
    } else if (hasLoadFailed) {
      reportLibraryOperationFailure(url, listError);
      notificationsService.error(`Failed to load ${type}`);
    }
  }, [isListError, listErrorUpdatedAt]);

  const isUsingCache = activeFallback !== null;
  const cachedAt = activeFallback?.cachedAt ?? null;
  const ingredients =
    listData?.items ?? activeFallback?.items ?? EMPTY_INGREDIENTS;
  const hasMoreIngredients = (listData?.nextPage ?? null) !== null;
  const isLoading = shouldLoadData ? isListPending : !isScopeReady;
  const activeFallbackRef = useRef(activeFallback);
  activeFallbackRef.current = activeFallback;

  const setIngredients = useCallback(
    (update: SetStateAction<IIngredient[]>) => {
      const apply = (current: IIngredient[]) =>
        typeof update === 'function' ? update(current) : update;

      const key = listQueryKeyRef.current;
      const hasCachedList = queryClient
        .getQueriesData<IngredientsListData>({ queryKey: key })
        .some(([, data]) => data !== undefined);

      if (!hasCachedList) {
        const fallback = activeFallbackRef.current;
        if (fallback) {
          setFallbackEdits((current) => ({
            ...fallback,
            items: apply(
              current?.cacheKey === fallback.cacheKey
                ? current.items
                : fallback.items,
            ),
          }));
        }
        return;
      }

      queryClient.setQueriesData<IngredientsListData>(
        { queryKey: key },
        (current) =>
          current ? { ...current, items: apply(current.items) } : current,
      );
    },
    [queryClient],
  );

  // A user refresh counts as refreshing until its last overlapping read ends.
  const refreshingCountRef = useRef(0);
  const findAllIngredientsByCategory = useCallback(
    async (isRefreshing: boolean = false) => {
      if (!shouldLoadData) {
        return;
      }
      if (isRefreshing) {
        refreshingCountRef.current += 1;
        setIsRefreshing(true);
      }

      try {
        const hadRows = queryClient
          .getQueriesData<IngredientsListData>({
            queryKey: listQueryKeyRef.current,
          })
          .some(([, data]) => data !== undefined);
        const result = await refetchList();
        if (result.isError && hadRows && isRefreshing) {
          notificationsService.error(`Failed to refresh ${type}`);
        }
      } finally {
        if (isRefreshing) {
          refreshingCountRef.current -= 1;
          if (refreshingCountRef.current === 0) {
            setIsRefreshing(false);
          }
        }
      }
    },
    [
      notificationsService,
      queryClient,
      refetchList,
      setIsRefreshing,
      shouldLoadData,
      type,
    ],
  );

  const loadMoreIngredients = useCallback(async () => {
    const nextPage = listData?.nextPage ?? null;
    const lastListQuery = listData?.listQuery ?? null;
    if (!nextPage || !lastListQuery || loadMoreControllerRef.current) {
      return;
    }

    const sequence = loadSequenceRef.current;
    const key = listQueryKeyRef.current;
    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    setIsLoadingMoreIngredients(true);

    try {
      const service = await getIngredientsService();
      const pageQuery: IQueryParams =
        'cursor' in nextPage
          ? { ...lastListQuery, cursor: nextPage.cursor }
          : { ...lastListQuery, page: nextPage.page };
      const result = await service.findAllPage(pageQuery, controller.signal);

      if (controller.signal.aborted || sequence !== loadSequenceRef.current) {
        return;
      }

      queryClient.setQueriesData<IngredientsListData>(
        { queryKey: key },
        (current) =>
          current
            ? {
                ...current,
                items: appendUniqueIngredients(current.items, result.items),
                nextPage: resolveNextPage(result),
              }
            : current,
      );
    } catch (error) {
      if (
        isIgnoredLibraryFailure(error, controller.signal) ||
        sequence !== loadSequenceRef.current
      ) {
        return;
      }
      reportLibraryOperationFailure(url, error);
      notificationsService.error(`Failed to load more ${type}`);
    } finally {
      if (loadMoreControllerRef.current === controller) {
        loadMoreControllerRef.current = null;
        setIsLoadingMoreIngredients(false);
      }
    }
  }, [
    getIngredientsService,
    listData,
    notificationsService,
    queryClient,
    type,
    url,
  ]);

  const shouldLoadFolders = loadFolders && shouldLoadData;
  const foldersQuery = useAuthedQuery<FoldersService, IFolder[]>({
    enabled: shouldLoadFolders,
    queryFn: async (service, signal) => {
      const queryParams: IQueryParams = {};
      if (scope === PageScope.BRAND && brandId) {
        queryParams.brand = brandId;
      } else if (scope === PageScope.ORGANIZATION && organizationId) {
        queryParams.organization = organizationId;
      }

      const data = await service.findAll(queryParams, signal);
      logger.info('GET /folders success', data);
      return data;
    },
    queryKey: [
      'library-folders',
      scope,
      organizationId ?? null,
      brandId ?? null,
    ],
    service: (token: string) => FoldersService.getInstance(token),
  });

  const {
    data: folders = EMPTY_FOLDERS,
    error: foldersError,
    errorUpdatedAt: foldersErrorUpdatedAt,
    isError: isFoldersError,
    isPending: isFoldersPending,
    refetch: refetchFolders,
  } = foldersQuery;
  const isLoadingFolders =
    loadFolders && (shouldLoadData ? isFoldersPending : !isScopeReady);

  // biome-ignore lint/correctness/useExhaustiveDependencies: foldersErrorUpdatedAt marks each new failed read.
  useEffect(() => {
    if (isFoldersError && !isIgnoredLibraryFailure(foldersError)) {
      reportLibraryOperationFailure('GET /folders', foldersError);
    }
  }, [foldersErrorUpdatedAt, isFoldersError]);

  const findAllFolders = useCallback(async () => {
    if (shouldLoadFolders) {
      await refetchFolders();
    }
  }, [refetchFolders, shouldLoadFolders]);

  useEffect(() => {
    if (onRefresh) {
      onRefresh(() => findAllIngredientsByCategory(true));
    }
  }, [findAllIngredientsByCategory, onRefresh]);

  useEffect(() => {
    const handleLibraryAssetsRefresh = (event: Event) => {
      if (libraryAssetsRefreshIncludesList(event)) {
        void findAllIngredientsByCategory(true);
      }
    };

    window.addEventListener(
      LIBRARY_ASSETS_REFRESH_EVENT,
      handleLibraryAssetsRefresh,
    );

    return () => {
      window.removeEventListener(
        LIBRARY_ASSETS_REFRESH_EVENT,
        handleLibraryAssetsRefresh,
      );
    };
  }, [findAllIngredientsByCategory]);

  // Sync folder param from URL
  useEffect(() => {
    const folderParam = parsedSearchParams.get('folder') || undefined;
    setSelectedFolderId((prev) => (folderParam !== prev ? folderParam : prev));
  }, [parsedSearchParams]);

  // Cleanup socket subscriptions on unmount
  useEffect(() => {
    return () => {
      socketSubscriptionsRef.current.forEach((unsubscribe) => {
        unsubscribe();
      });
      socketSubscriptionsRef.current = [];
    };
  }, []);

  useEffect(
    () => () => {
      loadMoreControllerRef.current?.abort();
    },
    [],
  );

  return {
    cachedAt,
    findAllFolders,
    findAllIngredientsByCategory,
    folders,
    getBulkIngredientsService,
    hasMoreIngredients,
    ingredients,
    isLoading,
    isLoadingFolders,
    isLoadingMoreIngredients,
    loadMoreIngredients,
    isUsingCache,
    loadError,
    notificationsService,
    selectedFolderId,
    setIngredients,
    setSelectedFolderId,
    socketSubscriptionsRef,
  };
}
