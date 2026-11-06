'use client';

import {
  INGREDIENT_LINEAGE_PAGE_SIZE,
  type IngredientLineageDirection,
} from '@genfeedai/contracts';
import type { IIngredientLineagePage } from '@genfeedai/contracts/interfaces';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UseIngredientLineageResult } from '@/props/content/ingredient.props';

/** The pages after the first, loaded by "Show more" for one asset. */
interface LineageMorePages {
  hasError: boolean;
  identity: string;
  isLoading: boolean;
  pages: IIngredientLineagePage[];
}

interface LineageRequest {
  identity: string;
  /** Bumped per request so retrying the same page re-runs the load. */
  nonce: number;
  page: number;
}

function createIngredientsService(token: string): IngredientsService {
  return IngredientsService.getInstance(token);
}

function emptyMorePages(identity: string): LineageMorePages {
  return { hasError: false, identity, isLoading: false, pages: [] };
}

/**
 * One direction of an asset's lineage, a page at a time. The first page is
 * cached per asset and direction, so reopening an asset paints its lineage at
 * once and refreshes it in the background; `loadMore` appends the next page.
 * Pages from a previous asset are never shown for the current one, coming back
 * to an asset starts at its first page, and a change aborts the request in
 * flight.
 */
export function useIngredientLineage(
  ingredientId: string,
  direction: IngredientLineageDirection,
): UseIngredientLineageResult {
  const getIngredientsService = useAuthedService(createIngredientsService);
  const identity = `${ingredientId}\u0001${direction}`;

  const firstPage = useAuthedQuery<IngredientsService, IIngredientLineagePage>({
    queryFn: (service, signal) =>
      service.findLineage(ingredientId, direction, {
        limit: INGREDIENT_LINEAGE_PAGE_SIZE,
        page: 1,
        signal,
      }),
    queryKey: ['ingredient-lineage', ingredientId, direction],
    service: createIngredientsService,
  });

  const [morePages, setMorePages] = useState<LineageMorePages>(() =>
    emptyMorePages(identity),
  );
  const [request, setRequest] = useState<LineageRequest>({
    identity,
    nonce: 0,
    page: 1,
  });
  // A request left over from another asset never applies to this one, so
  // coming back to an asset always starts at its first page.
  const { nonce, page } =
    request.identity === identity ? request : { nonce: 0, page: 1 };

  useEffect(() => {
    setRequest((current) =>
      current.identity === identity ? current : { identity, nonce: 0, page: 1 },
    );
    setMorePages((current) =>
      current.identity === identity ? current : emptyMorePages(identity),
    );
  }, [identity]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` only re-runs the load so a failed page is retried
  useEffect(() => {
    if (page <= 1) {
      return;
    }

    const controller = new AbortController();

    async function load() {
      setMorePages((current) =>
        current.identity === identity
          ? { ...current, hasError: false, isLoading: true }
          : { ...emptyMorePages(identity), isLoading: true },
      );

      try {
        const service = await getIngredientsService();
        const result = await service.findLineage(ingredientId, direction, {
          limit: INGREDIENT_LINEAGE_PAGE_SIZE,
          page,
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        setMorePages((current) => ({
          hasError: false,
          identity,
          isLoading: false,
          // Page n sits at n - 2: the first page lives in the cache.
          pages:
            current.identity === identity
              ? [...current.pages.slice(0, page - 2), result]
              : [result],
        }));
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        logger.error(
          `GET /ingredients/${ingredientId}/lineage/${direction} failed`,
          error,
        );
        setMorePages((current) => ({
          ...(current.identity === identity
            ? current
            : emptyMorePages(identity)),
          hasError: true,
          isLoading: false,
        }));
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [direction, getIngredientsService, identity, ingredientId, nonce, page]);

  const firstPageError = firstPage.error;
  const hasFirstPage = firstPage.data !== undefined;
  useEffect(() => {
    if (firstPageError && !hasFirstPage) {
      logger.error(
        `GET /ingredients/${ingredientId}/lineage/${direction} failed`,
        firstPageError,
      );
    }
  }, [direction, firstPageError, hasFirstPage, ingredientId]);

  const extra =
    morePages.identity === identity ? morePages : emptyMorePages(identity);
  const loadedPages = useMemo(
    () => (firstPage.data ? [firstPage.data, ...extra.pages] : []),
    [extra.pages, firstPage.data],
  );
  const lastPage = loadedPages.at(-1);
  // The next page follows the last one that actually loaded, so a failed
  // "Show more" is retried instead of skipping its entries.
  const loadedPage = loadedPages.length;

  const loadMore = useCallback(() => {
    setRequest({ identity, nonce: nonce + 1, page: loadedPage + 1 });
  }, [identity, loadedPage, nonce]);

  const items = useMemo(
    () => loadedPages.flatMap((loaded) => loaded.items),
    [loadedPages],
  );

  return {
    // A failed background refresh keeps the loaded lineage on screen.
    hasError: (firstPage.isError && !hasFirstPage) || extra.hasError,
    hasNext: lastPage?.hasNext ?? false,
    hiddenCount: lastPage?.hiddenCount ?? 0,
    isLoading: firstPage.isLoading || extra.isLoading,
    items,
    loadMore,
  };
}
