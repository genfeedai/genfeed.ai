'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { type IngredientOrigin, IngredientStatus } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type {
  IIngredient,
  IPaginatedResponse,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import type {
  UseGalleryLibraryProps,
  UseGalleryLibraryReturn,
} from '@genfeedai/props/modals/modal-gallery.props';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Newest first, the Library's default order. */
export const GALLERY_LIBRARY_DEFAULT_SORT = 'createdAt: -1';

const GALLERY_LIBRARY_QUERY_KEY = 'gallery-library';

/**
 * Only finished assets can be attached: a processing render has no file yet and
 * a failed one never will.
 */
const PICKABLE_STATUSES: readonly IngredientStatus[] = [
  IngredientStatus.UPLOADED,
  IngredientStatus.GENERATED,
  IngredientStatus.VALIDATED,
];

const EMPTY_ITEMS: IIngredient[] = [];

type NextPage = { cursor: string } | { page: number } | null;

/** The pages "load more" appended to one cached first page. */
interface GalleryLibraryMorePages {
  /** The first page these follow; a different first page drops them. */
  firstPage: IPaginatedResponse<IIngredient>;
  items: IIngredient[];
  nextPage: NextPage;
}

function createIngredientsService(token: string): IngredientsService {
  return IngredientsService.getInstance('ingredients', token);
}

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
 *
 * The first page is cached per brand, category and filters, so a reopened
 * picker paints its grid at once and refreshes it in the background, and a
 * new search or filter keeps the current tiles until its own rows land.
 */
export function useGalleryLibrary({
  category,
  isOpen,
}: UseGalleryLibraryProps): UseGalleryLibraryReturn {
  const { brandId } = useBrand();
  const queryClient = useQueryClient();
  const [morePages, setMorePages] = useState<GalleryLibraryMorePages | null>(
    null,
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [origins, setOrigins] = useState<IngredientOrigin[]>([]);
  const [isStarredOnly, setIsStarredOnly] = useState(false);
  const [sort, setSort] = useState(GALLERY_LIBRARY_DEFAULT_SORT);
  const loadMoreControllerRef = useRef<AbortController | null>(null);

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const getIngredientsService = useAuthedService(createIngredientsService);

  const trimmedSearch = search.trim();
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
      ...(trimmedSearch && { search: trimmedSearch }),
    }),
    [brandId, category, isStarredOnly, origins, sort, trimmedSearch],
  );

  const scopeKey = [GALLERY_LIBRARY_QUERY_KEY, brandId ?? null, category];
  const firstPageQuery = useAuthedQuery<
    IngredientsService,
    IPaginatedResponse<IIngredient>
  >({
    enabled: isOpen,
    keepPreviousDataWithin: scopeKey,
    queryFn: (service, signal) => service.findAllPage(query, signal),
    queryKey: [
      ...scopeKey,
      { isStarredOnly, origins, search: trimmedSearch, sort },
    ],
    service: createIngredientsService,
  });

  const firstPage = firstPageQuery.data;
  const isShowingPreviousFilter = firstPageQuery.isPlaceholderData;

  // Another filter or brand never receives a "load more" still in flight.
  const queryHash = JSON.stringify(query);
  // biome-ignore lint/correctness/useExhaustiveDependencies: queryHash marks a new list to load more of
  useEffect(() => {
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = null;
    setIsLoadingMore(false);
  }, [queryHash]);

  // Appended pages belong to the first page they followed: a refreshed or
  // different first page starts the list over from its own cursor.
  const appended =
    morePages && firstPage && morePages.firstPage === firstPage
      ? morePages
      : null;
  const items = useMemo(() => {
    if (!firstPage) {
      return EMPTY_ITEMS;
    }
    if (!appended) {
      return firstPage.items;
    }
    const seen = new Set(firstPage.items.map((item) => item.id));
    return [
      ...firstPage.items,
      ...appended.items.filter((item) => !seen.has(item.id)),
    ];
  }, [appended, firstPage]);
  const nextPage = appended
    ? appended.nextPage
    : firstPage
      ? resolveNextPage(firstPage)
      : null;

  // Only a read with nothing to show says so; a failed background refresh
  // keeps the grid on screen.
  const firstPageError = firstPageQuery.error;
  const hasFirstPage = firstPage !== undefined;
  useEffect(() => {
    if (!firstPageError || hasFirstPage) {
      return;
    }
    logger.error('Failed to load the gallery Library', firstPageError);
    notificationsService.error('Failed to load the Library');
  }, [firstPageError, hasFirstPage, notificationsService]);

  const loadMore = useCallback(async () => {
    if (
      !firstPage ||
      !nextPage ||
      isShowingPreviousFilter ||
      loadMoreControllerRef.current
    ) {
      return;
    }

    const base = firstPage;
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
      setMorePages((current) => {
        const previous = current?.firstPage === base ? current.items : [];
        const seen = new Set(previous.map((item) => item.id));
        return {
          firstPage: base,
          items: [
            ...previous,
            ...result.items.filter((item) => !seen.has(item.id)),
          ],
          nextPage: resolveNextPage(result),
        };
      });
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
  }, [
    firstPage,
    getIngredientsService,
    isShowingPreviousFilter,
    nextPage,
    notificationsService,
    query,
  ]);

  const onClearFilters = useCallback(() => {
    setOrigins([]);
    setIsStarredOnly(false);
    setSort(GALLERY_LIBRARY_DEFAULT_SORT);
  }, []);

  // An upload lands on the first page: every cached filter of the picker goes
  // stale, and the open one re-reads with its tiles kept on screen.
  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: [GALLERY_LIBRARY_QUERY_KEY],
    });
  }, [queryClient]);

  // A reopened picker starts from the whole Library again.
  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      onClearFilters();
    }
  }, [isOpen, onClearFilters]);

  return {
    // The previous filter's tiles stay only until the new ones land; they are
    // never paged further.
    hasMore: !isShowingPreviousFilter && nextPage !== null,
    isLoading: isOpen && firstPageQuery.isLoading,
    isLoadingMore,
    isStarredOnly,
    items,
    loadMore,
    onClearFilters,
    onOriginsChange: setOrigins,
    onRefresh,
    onSearchChange: setSearch,
    onSortChange: setSort,
    onStarredOnlyChange: setIsStarredOnly,
    origins,
    search,
    sort,
  };
}
