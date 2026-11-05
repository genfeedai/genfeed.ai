'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { type IngredientOrigin, IngredientStatus } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type {
  IIngredient,
  IPaginatedResponse,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type {
  UseGalleryLibraryProps,
  UseGalleryLibraryReturn,
} from '@genfeedai/props/modals/modal-gallery.props';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Newest first, the Library's default order. */
export const GALLERY_LIBRARY_DEFAULT_SORT = 'createdAt: -1';

/**
 * Only finished assets can be attached: a processing render has no file yet and
 * a failed one never will.
 */
const PICKABLE_STATUSES: readonly IngredientStatus[] = [
  IngredientStatus.UPLOADED,
  IngredientStatus.GENERATED,
  IngredientStatus.VALIDATED,
];

type NextPage = { cursor: string } | { page: number } | null;

function resolveNextPage(result: IPaginatedResponse<IIngredient>): NextPage {
  if (result.nextCursor) {
    return { cursor: result.nextCursor };
  }
  if (result.nextCursor === undefined && result.hasNext) {
    return { page: result.page + 1 };
  }
  return null;
}

/**
 * The picker's view of the Library: the same `GET /ingredients` list the
 * Library page reads, pinned to one category, with the search, origin,
 * starred and sort axes held in local state instead of the URL.
 */
export function useGalleryLibrary({
  category,
  isOpen,
}: UseGalleryLibraryProps): UseGalleryLibraryReturn {
  const { brandId } = useBrand();
  const [items, setItems] = useState<IIngredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextPage, setNextPage] = useState<NextPage>(null);
  const [search, setSearch] = useState('');
  const [origins, setOrigins] = useState<IngredientOrigin[]>([]);
  const [isStarredOnly, setIsStarredOnly] = useState(false);
  const [sort, setSort] = useState(GALLERY_LIBRARY_DEFAULT_SORT);
  const [revision, setRevision] = useState(0);
  const loadMoreControllerRef = useRef<AbortController | null>(null);

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance('ingredients', token),
  );

  const query = useMemo<IQueryParams>(
    () => ({
      categories: [category],
      limit: ITEMS_PER_PAGE * 2,
      paging: 'cursor',
      sort,
      status: [...PICKABLE_STATUSES],
      ...(brandId && { brand: brandId }),
      ...(origins.length > 0 && { origins }),
      ...(isStarredOnly && { isFavorite: 'true' }),
      ...(search.trim() && { search: search.trim() }),
    }),
    [brandId, category, isStarredOnly, origins, search, sort],
  );

  // `revision` reloads the first page after an upload lands.
  const request = useMemo(() => ({ query, revision }), [query, revision]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const controller = new AbortController();
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = null;
    setIsLoading(true);
    setIsLoadingMore(false);

    const load = async () => {
      try {
        const service = await getIngredientsService();
        if (controller.signal.aborted) return;
        const result = await service.findAllPage(
          request.query,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setItems(result.items);
        setNextPage(resolveNextPage(result));
      } catch (error) {
        if (controller.signal.aborted) return;
        logger.error('Failed to load the gallery Library', error);
        notificationsService.error('Failed to load the Library');
        setItems([]);
        setNextPage(null);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [getIngredientsService, isOpen, notificationsService, request]);

  const loadMore = useCallback(async () => {
    if (!nextPage || loadMoreControllerRef.current) {
      return;
    }

    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    setIsLoadingMore(true);

    try {
      const service = await getIngredientsService();
      const result = await service.findAllPage(
        'cursor' in nextPage
          ? { ...query, cursor: nextPage.cursor }
          : { ...query, page: nextPage.page },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [
          ...current,
          ...result.items.filter((item) => !seen.has(item.id)),
        ];
      });
      setNextPage(resolveNextPage(result));
    } catch (error) {
      if (controller.signal.aborted) return;
      logger.error('Failed to load more of the gallery Library', error);
      notificationsService.error('Failed to load more from the Library');
    } finally {
      if (loadMoreControllerRef.current === controller) {
        loadMoreControllerRef.current = null;
        setIsLoadingMore(false);
      }
    }
  }, [getIngredientsService, nextPage, notificationsService, query]);

  const onClearFilters = useCallback(() => {
    setOrigins([]);
    setIsStarredOnly(false);
    setSort(GALLERY_LIBRARY_DEFAULT_SORT);
  }, []);

  // A reopened picker starts from the whole Library again.
  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      onClearFilters();
    }
  }, [isOpen, onClearFilters]);

  return {
    hasMore: nextPage !== null,
    isLoading,
    isLoadingMore,
    isStarredOnly,
    items,
    loadMore,
    onClearFilters,
    onOriginsChange: setOrigins,
    onRefresh: () => setRevision((current) => current + 1),
    onSearchChange: setSearch,
    onSortChange: setSort,
    onStarredOnlyChange: setIsStarredOnly,
    origins,
    search,
    sort,
  };
}
