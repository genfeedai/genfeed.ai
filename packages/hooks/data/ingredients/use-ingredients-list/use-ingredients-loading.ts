'use client';

import type { IngredientCategorySchema } from '@genfeedai/client/schemas';
import {
  IngredientCategory,
  IngredientStatus,
  PageScope,
} from '@genfeedai/contracts';
import {
  ITEMS_PER_PAGE,
  LIBRARY_ASSETS_REFRESH_EVENT,
} from '@genfeedai/contracts/constants';
import type {
  IFilters,
  IFolder,
  IIngredient,
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
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import {
  createCacheKey,
  createLocalStorageCache,
} from '@helpers/data/cache/cache.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';

const INGREDIENTS_CACHE_TTL_MS = 15 * 60 * 1000;

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

interface UseIngredientsLoadingProps {
  type: string;
  scope: PageScope;
  brandId?: string | null;
  organizationId?: string | null;
  singularType: string;
  formatFilter?: string;
  currentPage: number;
  query: IFilters;
  form: UseFormReturn<IngredientCategorySchema>;
  setIsRefreshing: (isRefreshing: boolean) => void;
  onRefresh?: (fn: () => void) => void;
  parsedSearchParams: URLSearchParams;
  loadFolders: boolean;
}

export function useIngredientsLoading({
  type,
  scope,
  brandId,
  organizationId,
  singularType,
  formatFilter,
  currentPage,
  query,
  form,
  setIsRefreshing,
  onRefresh,
  parsedSearchParams,
  loadFolders,
}: UseIngredientsLoadingProps) {
  const notificationsService = NotificationsService.getInstance();

  const getIngredientsService = useAuthedService((token) =>
    IngredientsService.getInstance(type, token),
  );

  const getBulkIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const getFoldersService = useAuthedService((token: string) =>
    FoldersService.getInstance(token),
  );

  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFolders, setIsLoadingFolders] = useState(true);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [isUsingCache, setIsUsingCache] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [ingredients, setIngredients] = useState<IIngredient[]>([]);
  const [folders, setFolders] = useState<IFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(
    (parsedSearchParams.get('folder') as string) || undefined,
  );

  const socketSubscriptionsRef = useRef<Array<() => void>>([]);

  const _queryKey = useMemo(() => JSON.stringify(query ?? {}), [query]);

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

  const ingredientsCacheKey = useMemo(
    () =>
      createCacheKey(
        type,
        scope,
        brandId ?? 'none',
        organizationId ?? 'none',
        _queryKey ?? 'none',
        formatFilter ?? 'all',
        currentPage,
      ),
    [
      type,
      scope,
      brandId,
      organizationId,
      _queryKey,
      formatFilter,
      currentPage,
    ],
  );

  const findAllIngredientsByCategory = useCallback(
    async (isRefreshing: boolean = false, signal?: AbortSignal) => {
      setIsLoading(!isRefreshing);
      setIsRefreshing(isRefreshing);
      setLoadError(null);

      const url = `GET /${type}`;

      try {
        let queryParams: IQueryParams = {
          ...form.getValues(),
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
          queryParams.organization = organizationId;
        }

        if (
          Array.isArray(queryParams.status) &&
          queryParams.status.length === 0
        ) {
          delete queryParams.status;
        }

        if (query.folder) {
          queryParams.folder = query.folder;
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

        queryParams = sanitizeQueryParams(queryParams);

        let data: Ingredient[] = [];

        if (scope === PageScope.ORGANIZATION && organizationId) {
          const organizationsService = await getOrganizationsService();
          data = await organizationsService.findOrganizationIngredients(
            organizationId,
            { ...queryParams, category: singularType },
          );
        } else {
          const service = await getIngredientsService();
          data = await service.findAll(queryParams);
        }

        if (signal?.aborted) {
          return;
        }

        logger.info(`${url} success`, data);

        setIngredients(data as unknown as IIngredient[]);

        if (ingredientsCache && ingredientsCacheMeta) {
          ingredientsCache.set(
            ingredientsCacheKey,
            data as unknown as IIngredient[],
            INGREDIENTS_CACHE_TTL_MS,
          );
          ingredientsCacheMeta.set(
            ingredientsCacheKey,
            new Date().toISOString(),
            INGREDIENTS_CACHE_TTL_MS,
          );
        }

        setIsUsingCache(false);
        setCachedAt(null);
        setLoadError(null);
      } catch (error) {
        if (isIgnoredLibraryFailure(error, signal)) {
          return;
        }
        const cached = ingredientsCache?.get(ingredientsCacheKey) ?? [];
        const cachedTimestamp =
          ingredientsCacheMeta?.get(ingredientsCacheKey) ?? null;

        if (cached.length > 0) {
          setIngredients(cached);
          setIsUsingCache(true);
          setCachedAt(cachedTimestamp);
          setLoadError(null);
        } else {
          setIsUsingCache(false);
          setCachedAt(null);
          setLoadError(`Failed to load ${type}`);
          reportLibraryOperationFailure(url, error);
          notificationsService.error(`Failed to load ${type}`);
        }
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [
      brandId,
      ingredientsCache,
      ingredientsCacheKey,
      ingredientsCacheMeta,
      formatFilter,
      getIngredientsService,
      getOrganizationsService,
      notificationsService,
      organizationId,
      scope,
      currentPage,
      setIsRefreshing,
      singularType,
      type,
      form.getValues,
      query,
    ],
  );

  const findAllFolders = useCallback(
    async (signal?: AbortSignal) => {
      const url = 'GET /folders';

      setIsLoadingFolders(true);
      try {
        const service = await getFoldersService();

        const queryParams: IQueryParams = {};

        if (scope === PageScope.BRAND && brandId) {
          queryParams.brand = brandId;
        } else if (scope === PageScope.ORGANIZATION && organizationId) {
          queryParams.organization = organizationId;
        }

        const data = await service.findAll(queryParams);

        if (signal?.aborted) {
          return;
        }

        setFolders(data);
        logger.info(`${url} success`, data);
      } catch (error) {
        if (isIgnoredLibraryFailure(error, signal)) {
          return;
        }
        reportLibraryOperationFailure(url, error);
      } finally {
        setIsLoadingFolders(false);
      }
    },
    [brandId, organizationId, scope, getFoldersService],
  );

  // Load ingredients on mount and when dependencies change
  useEffect(() => {
    const abortController = new AbortController();

    const shouldLoadData =
      scope === PageScope.SUPERADMIN ||
      scope === PageScope.ORGANIZATION ||
      (scope === PageScope.BRAND && brandId);

    if (shouldLoadData) {
      findAllIngredientsByCategory(false, abortController.signal);
    } else {
      setIsLoading(false);
    }

    if (onRefresh) {
      onRefresh(() => findAllIngredientsByCategory(true));
    }

    return () => {
      abortController.abort();
    };
  }, [brandId, findAllIngredientsByCategory, onRefresh, scope]);

  useEffect(() => {
    const handleLibraryAssetsRefresh = () => {
      void findAllIngredientsByCategory(true);
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

  // Load folders on mount
  useEffect(() => {
    const abortController = new AbortController();

    if (!loadFolders) {
      setIsLoadingFolders(false);
      return () => {
        abortController.abort();
      };
    }

    const shouldLoadFolders =
      scope === PageScope.SUPERADMIN ||
      scope === PageScope.ORGANIZATION ||
      (scope === PageScope.BRAND && brandId);

    if (shouldLoadFolders) {
      findAllFolders(abortController.signal);
    }

    return () => {
      abortController.abort();
    };
  }, [brandId, findAllFolders, loadFolders, scope]);

  // Refetch when query changes
  useEffect(() => {
    const abortController = new AbortController();

    const shouldLoadData =
      scope === PageScope.SUPERADMIN ||
      scope === PageScope.ORGANIZATION ||
      (scope === PageScope.BRAND && brandId);

    if (shouldLoadData && query && Object.keys(query).length > 0) {
      findAllIngredientsByCategory(false, abortController.signal);
    }

    return () => {
      abortController.abort();
    };
  }, [brandId, findAllIngredientsByCategory, query, scope]);

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

  return {
    cachedAt,
    findAllFolders,
    findAllIngredientsByCategory,
    folders,
    getBulkIngredientsService,
    ingredients,
    isLoading,
    isLoadingFolders,
    isUsingCache,
    loadError,
    notificationsService,
    selectedFolderId,
    setFolders,
    setIngredients,
    setSelectedFolderId,
    socketSubscriptionsRef,
  };
}
