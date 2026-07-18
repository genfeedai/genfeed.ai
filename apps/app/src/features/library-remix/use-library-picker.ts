'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import type { Ingredient } from '@genfeedai/models/content/ingredient.model';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { PagesService } from '@genfeedai/services/content/pages.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('status' in error)) {
    return null;
  }

  return typeof error.status === 'number' ? error.status : null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function getCategoryConfig(category: LibraryPickerCategory) {
  return (
    LIBRARY_PICKER_CATEGORIES.find((candidate) => candidate.key === category) ??
    LIBRARY_PICKER_CATEGORIES[0]
  );
}

export function useLibraryPicker(params: {
  readonly onSelect: (reference: LibraryArtifactReference) => void;
}): UseLibraryPickerResult {
  const { onSelect } = params;
  const { brandId, isReady, organizationId } = useBrand();
  const [category, setCategory] = useState<LibraryPickerCategory>('images');
  const [page, setPage] = useState(1);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isValidatingId, setIsValidatingId] = useState<string | null>(null);
  const [selectionFailure, setSelectionFailure] =
    useState<LibraryPickerSelectionFailure | null>(null);
  const [state, setState] = useState<LibraryPickerState>({
    hasMore: false,
    items: [],
    status: 'loading',
    total: 0,
  });
  const categoryConfig = useMemo(() => getCategoryConfig(category), [category]);
  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance<Ingredient>(categoryConfig.key, token),
  );

  const loadPage = useCallback(
    async (nextPage: number, append: boolean, signal?: AbortSignal) => {
      if (!isReady) {
        return;
      }
      if (!brandId || !organizationId) {
        setState({
          hasMore: false,
          items: [],
          status: 'permission-denied',
          total: 0,
        });
        return;
      }

      if (append) {
        setIsLoadingMore(true);
      } else {
        setState((current) => ({ ...current, status: 'loading' }));
      }

      try {
        const service = (await getIngredientsService()) as IngredientsService;
        const items = await service.findAll(
          {
            brand: brandId,
            lightweight: true,
            limit: LIBRARY_PICKER_PAGE_SIZE,
            page: nextPage,
            sort: 'createdAt: -1',
            status: [
              IngredientStatus.UPLOADED,
              IngredientStatus.GENERATED,
              IngredientStatus.VALIDATED,
            ],
          },
          signal,
        );
        if (signal?.aborted) {
          return;
        }

        const totalPages = PagesService.getTotalPages();
        const total = PagesService.getTotalDocs();
        setState((current) => {
          const nextItems = append
            ? Array.from(
                new Map(
                  [...current.items, ...items].map((item) => [item.id, item]),
                ).values(),
              )
            : items;

          return {
            hasMore: nextPage < totalPages,
            items: nextItems,
            status: nextItems.length > 0 ? 'ready' : 'empty',
            total,
          };
        });
        setPage(nextPage);
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        const status = getErrorStatus(error);
        setState((current) => ({
          hasMore: false,
          items: append ? current.items : [],
          status:
            status === 401 || status === 403 ? 'permission-denied' : 'error',
          total: append ? current.total : 0,
        }));
      } finally {
        if (!signal?.aborted) {
          setIsLoadingMore(false);
        }
      }
    },
    [brandId, getIngredientsService, isReady, organizationId],
  );

  useEffect(() => {
    void reloadVersion;
    const abortController = new AbortController();
    setPage(1);
    setSelectionFailure(null);
    void loadPage(1, false, abortController.signal);

    return () => abortController.abort();
  }, [loadPage, reloadVersion]);

  const select = useCallback(
    async (ingredient: IIngredient) => {
      if (!brandId || !organizationId || isValidatingId) {
        return;
      }

      setIsValidatingId(ingredient.id);
      setSelectionFailure(null);
      try {
        const service = (await getIngredientsService()) as IngredientsService;
        const confirmed = await service.findOne(ingredient.id);
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

        onSelect(reference);
      } catch (error) {
        const status = getErrorStatus(error);
        setSelectionFailure(
          status === 404
            ? 'stale'
            : status === 401 || status === 403
              ? 'unauthorized'
              : 'error',
        );
      } finally {
        setIsValidatingId(null);
      }
    },
    [
      brandId,
      categoryConfig.category,
      getIngredientsService,
      isValidatingId,
      organizationId,
      onSelect,
    ],
  );

  return {
    category,
    isLoadingMore,
    isValidatingId,
    loadMore: () => {
      if (!isLoadingMore && state.hasMore) {
        void loadPage(page + 1, true);
      }
    },
    retry: () => setReloadVersion((version) => version + 1),
    select,
    selectionFailure,
    setCategory,
    state,
  };
}
