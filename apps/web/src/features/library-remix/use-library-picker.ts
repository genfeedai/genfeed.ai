'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type {
  IIngredient,
  IPaginatedResponse,
} from '@genfeedai/contracts/interfaces';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { getErrorStatus } from '@utils/error/json-api-status.util';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildLibraryArtifactReference,
  type LibraryArtifactReference,
  readRelationshipId,
} from './library-remix-reference';

const LIBRARY_PICKER_PAGE_SIZE = 24;

export type LibraryPickerCategory = 'gifs' | 'images' | 'videos';

export const LIBRARY_PICKER_CATEGORIES = Object.freeze([
  Object.freeze({
    category: IngredientCategory.IMAGE,
    key: 'images',
    label: 'Images',
  }),
  Object.freeze({
    category: IngredientCategory.VIDEO,
    key: 'videos',
    label: 'Videos',
  }),
  Object.freeze({
    category: IngredientCategory.GIF,
    key: 'gifs',
    label: 'GIFs',
  }),
] as const);

type LibraryPickerLoadStatus =
  | 'empty'
  | 'error'
  | 'loading'
  | 'permission-denied'
  | 'ready';

export type LibraryPickerSelectionFailure = 'error' | 'stale' | 'unauthorized';

export interface LibraryPickerState {
  readonly hasMore: boolean;
  readonly items: readonly IIngredient[];
  readonly status: LibraryPickerLoadStatus;
  readonly total: number;
}

export interface UseLibraryPickerResult {
  readonly category: LibraryPickerCategory;
  readonly isLoadingMore: boolean;
  readonly isValidatingId: string | null;
  readonly loadMore: () => void;
  readonly retry: () => void;
  readonly select: (ingredient: IIngredient) => Promise<void>;
  readonly selectionFailure: LibraryPickerSelectionFailure | null;
  readonly setCategory: (category: LibraryPickerCategory) => void;
  readonly state: LibraryPickerState;
}

type IngredientsServiceFor = (
  category: LibraryPickerCategory,
) => IngredientsService;

/** The "Load more" pages appended to one cached first page. */
interface LibraryPickerMorePages {
  /** A failed "Load more", with its HTTP status when there was one. */
  readonly failure: { readonly status: number | undefined } | null;
  /** The first page these follow; a different first page drops them. */
  readonly firstPage: IPaginatedResponse<IIngredient>;
  readonly items: readonly IIngredient[];
  readonly page: number;
  readonly totalPages: number;
  readonly total: number;
}

const PICKABLE_STATUSES = [
  IngredientStatus.UPLOADED,
  IngredientStatus.GENERATED,
  IngredientStatus.VALIDATED,
];

const EMPTY_ITEMS: readonly IIngredient[] = [];

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isPermissionStatus(status: number | undefined): boolean {
  return status === 401 || status === 403;
}

function getCategoryConfig(category: LibraryPickerCategory) {
  return (
    LIBRARY_PICKER_CATEGORIES.find((candidate) => candidate.key === category) ??
    LIBRARY_PICKER_CATEGORIES[0]
  );
}

/** Each media type reads its own endpoint, so the service is per category. */
function createIngredientsServices(token: string): IngredientsServiceFor {
  return (category) => IngredientsService.getInstance(category, token);
}

function mergeItems(
  first: readonly IIngredient[],
  more: readonly IIngredient[],
): readonly IIngredient[] {
  return Array.from(
    new Map([...first, ...more].map((item) => [item.id, item])).values(),
  );
}

/**
 * The composer's Library picker: one media type of the effective brand, a
 * page at a time. The first page is cached per organization, brand and media
 * type, so reopening the picker paints its sources at once and refreshes them
 * in the background; "Load more" appends the next pages locally.
 */
export function useLibraryPicker(params: {
  readonly onSelect: (
    reference: LibraryArtifactReference,
    record: IIngredient,
  ) => void;
}): UseLibraryPickerResult {
  const { onSelect } = params;
  const { brandId, isReady, organizationId } = useBrand();
  const [category, setCategory] = useState<LibraryPickerCategory>('images');
  const [morePages, setMorePages] = useState<LibraryPickerMorePages | null>(
    null,
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isValidatingId, setIsValidatingId] = useState<string | null>(null);
  const [selectionFailure, setSelectionFailure] =
    useState<LibraryPickerSelectionFailure | null>(null);
  const loadMoreControllerRef = useRef<AbortController | null>(null);
  const categoryConfig = useMemo(() => getCategoryConfig(category), [category]);
  const getIngredientsServices = useAuthedService(createIngredientsServices);
  const hasScope = Boolean(brandId && organizationId);

  const firstPageQuery = useAuthedQuery<
    IngredientsServiceFor,
    IPaginatedResponse<IIngredient>
  >({
    enabled: isReady && hasScope,
    queryFn: (servicesFor, signal) =>
      servicesFor(category).findAllPage(
        {
          brand: brandId,
          lightweight: true,
          limit: LIBRARY_PICKER_PAGE_SIZE,
          page: 1,
          sort: 'createdAt: -1',
          status: PICKABLE_STATUSES,
        },
        signal,
      ),
    queryKey: [
      'library-picker',
      organizationId ?? null,
      brandId ?? null,
      category,
    ],
    service: createIngredientsServices,
  });
  const firstPage = firstPageQuery.data;
  const { refetch } = firstPageQuery;

  // A new brand or media type never receives a "Load more" still in flight.
  const scopeIdentity = `${organizationId}\u0001${brandId}\u0001${category}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: scopeIdentity marks a new list to load more of
  useEffect(() => {
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = null;
    setIsLoadingMore(false);
    setSelectionFailure(null);
  }, [scopeIdentity]);

  // Appended pages belong to the first page they followed: a refreshed or
  // different first page starts over from page one.
  const appended =
    morePages && firstPage && morePages.firstPage === firstPage
      ? morePages
      : null;

  const state = useMemo<LibraryPickerState>(() => {
    if (!isReady) {
      return {
        hasMore: false,
        items: EMPTY_ITEMS,
        status: 'loading',
        total: 0,
      };
    }
    if (!hasScope) {
      return {
        hasMore: false,
        items: EMPTY_ITEMS,
        status: 'permission-denied',
        total: 0,
      };
    }
    if (!firstPage) {
      // Only a read with nothing to show replaces the grid with its failure.
      if (firstPageQuery.isError) {
        return {
          hasMore: false,
          items: EMPTY_ITEMS,
          status: isPermissionStatus(getErrorStatus(firstPageQuery.error))
            ? 'permission-denied'
            : 'error',
          total: 0,
        };
      }
      return {
        hasMore: false,
        items: EMPTY_ITEMS,
        status: 'loading',
        total: 0,
      };
    }

    const items = appended
      ? mergeItems(firstPage.items, appended.items)
      : firstPage.items;
    if (appended?.failure) {
      return {
        hasMore: false,
        items,
        status: isPermissionStatus(appended.failure.status)
          ? 'permission-denied'
          : 'error',
        total: appended.total,
      };
    }
    const page = appended?.page ?? 1;
    const totalPages = appended?.totalPages ?? firstPage.totalPages;
    return {
      hasMore: page < totalPages,
      items,
      status: items.length > 0 ? 'ready' : 'empty',
      total: appended?.total ?? firstPage.total,
    };
  }, [
    appended,
    firstPage,
    firstPageQuery.error,
    firstPageQuery.isError,
    hasScope,
    isReady,
  ]);

  const loadMore = useCallback(() => {
    if (
      !firstPage ||
      !state.hasMore ||
      isLoadingMore ||
      loadMoreControllerRef.current
    ) {
      return;
    }

    const base = firstPage;
    const nextPage = (appended?.page ?? 1) + 1;
    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    setIsLoadingMore(true);

    async function load(): Promise<void> {
      try {
        const servicesFor = await getIngredientsServices();
        const result = await servicesFor(category).findAllPage(
          {
            brand: brandId,
            lightweight: true,
            limit: LIBRARY_PICKER_PAGE_SIZE,
            page: nextPage,
            sort: 'createdAt: -1',
            status: PICKABLE_STATUSES,
          },
          controller.signal,
        );
        if (controller.signal.aborted) {
          return;
        }
        setMorePages((current) => ({
          failure: null,
          firstPage: base,
          items: mergeItems(
            current?.firstPage === base ? current.items : EMPTY_ITEMS,
            result.items,
          ),
          page: nextPage,
          total: result.total,
          totalPages: result.totalPages,
        }));
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          return;
        }
        setMorePages((current) => ({
          failure: { status: getErrorStatus(error) },
          firstPage: base,
          items: current?.firstPage === base ? current.items : EMPTY_ITEMS,
          page: current?.firstPage === base ? current.page : 1,
          total: current?.firstPage === base ? current.total : base.total,
          totalPages:
            current?.firstPage === base ? current.totalPages : base.totalPages,
        }));
      } finally {
        if (loadMoreControllerRef.current === controller) {
          loadMoreControllerRef.current = null;
          setIsLoadingMore(false);
        }
      }
    }

    void load();
  }, [
    appended?.page,
    brandId,
    category,
    firstPage,
    getIngredientsServices,
    isLoadingMore,
    state.hasMore,
  ]);

  const retry = useCallback(() => {
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = null;
    setIsLoadingMore(false);
    setMorePages(null);
    setSelectionFailure(null);
    void refetch();
  }, [refetch]);

  const select = useCallback(
    async (ingredient: IIngredient) => {
      if (!brandId || !organizationId || isValidatingId) {
        return;
      }

      setIsValidatingId(ingredient.id);
      setSelectionFailure(null);
      try {
        const servicesFor = await getIngredientsServices();
        const confirmed = await servicesFor(category).findOne(ingredient.id);
        if (!confirmed || confirmed.category !== categoryConfig.category) {
          setSelectionFailure('stale');
          return;
        }

        const confirmedBrandId = readRelationshipId(confirmed.brand);
        const confirmedOrganizationId = readRelationshipId(
          confirmed.organization,
        );
        if (
          confirmedBrandId !== brandId ||
          confirmedOrganizationId !== organizationId
        ) {
          setSelectionFailure('unauthorized');
          return;
        }

        const reference = buildLibraryArtifactReference({
          brandId: confirmedBrandId,
          kind: 'ingredient',
          organizationId,
          recordId: confirmed.id,
          recordVersion: confirmed.version?.toString(),
        });
        if (!reference) {
          setSelectionFailure('stale');
          return;
        }

        onSelect(reference, confirmed);
      } catch (error) {
        const status = getErrorStatus(error);
        setSelectionFailure(
          status === 404
            ? 'stale'
            : isPermissionStatus(status)
              ? 'unauthorized'
              : 'error',
        );
      } finally {
        setIsValidatingId(null);
      }
    },
    [
      brandId,
      category,
      categoryConfig.category,
      getIngredientsServices,
      isValidatingId,
      organizationId,
      onSelect,
    ],
  );

  return {
    category,
    isLoadingMore,
    isValidatingId,
    loadMore,
    retry,
    select,
    selectionFailure,
    setCategory,
    state,
  };
}
