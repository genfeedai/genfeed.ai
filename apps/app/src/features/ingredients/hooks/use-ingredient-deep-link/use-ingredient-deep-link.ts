'use client';

import { LIBRARY_ASSET_QUERY_KEY } from '@genfeedai/contracts/constants';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { logger } from '@genfeedai/services/core/logger.service';
import { useIngredientServices } from '@hooks/data/ingredients/use-ingredient-services/use-ingredient-services';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';

interface UseIngredientDeepLinkProps {
  /** Ingredients already loaded for the current library route. */
  ingredients: IIngredient[];
  /** True while the list is still loading — defer the remote lookup until then. */
  isLoading: boolean;
  /** Opens the ingredient detail overlay. */
  onOpen: (ingredient: IIngredient) => void;
}

/**
 * Resolves `?asset=<id>` on a library list route and opens that ingredient.
 *
 * Library has no per-asset page — the detail view is an overlay over the list —
 * so a shareable asset link is the list route plus this query key. The id is
 * matched against the loaded page first and only fetched when it is not there
 * (a link into a different folder, filter, or page of results).
 *
 * The param is consumed on arrival: it is stripped from the URL once the
 * overlay opens, so dismissing the overlay cannot immediately reopen it and a
 * reload does not fight the user. Share links are built by
 * `createLibraryAssetRoute`, not by copying the address bar.
 *
 * @see packages/contracts/src/constants/library-asset-routes.constant.ts
 */
export function useIngredientDeepLink({
  ingredients,
  isLoading,
  onOpen,
}: UseIngredientDeepLinkProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { getIngredientsService } = useIngredientServices();

  const assetId = searchParams?.get(LIBRARY_ASSET_QUERY_KEY) ?? null;
  const searchParamsString = searchParams?.toString() ?? '';

  /** Ids already handled, so a re-render never reopens a dismissed overlay. */
  const handledAssetIdRef = useRef<string | null>(null);

  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  const clearAssetDeepLink = useCallback(() => {
    const nextSearchParams = new URLSearchParams(searchParamsString);
    if (!nextSearchParams.has(LIBRARY_ASSET_QUERY_KEY)) {
      return;
    }

    nextSearchParams.delete(LIBRARY_ASSET_QUERY_KEY);
    const nextQuery = nextSearchParams.toString();

    router.replace(`${pathname}${nextQuery ? `?${nextQuery}` : ''}`, {
      scroll: false,
    });
  }, [pathname, router, searchParamsString]);

  const loadedIngredient = useMemo(
    () =>
      assetId
        ? (ingredients.find((ingredient) => ingredient.id === assetId) ?? null)
        : null,
    [assetId, ingredients],
  );

  // Reset once the link is gone so the same asset can be deep-linked again.
  useEffect(() => {
    if (!assetId) {
      handledAssetIdRef.current = null;
    }
  }, [assetId]);

  useEffect(() => {
    if (!assetId || handledAssetIdRef.current === assetId) {
      return;
    }

    if (loadedIngredient) {
      handledAssetIdRef.current = assetId;
      onOpenRef.current(loadedIngredient);
      clearAssetDeepLink();
      return;
    }

    // Not on this page of results — wait for the list, then fetch it directly.
    if (isLoading) {
      return;
    }

    const controller = new AbortController();
    handledAssetIdRef.current = assetId;

    const fetchDeepLinkedIngredient = async () => {
      try {
        const service = await getIngredientsService();
        const [ingredient] = await service.findByIds([assetId]);

        if (controller.signal.aborted) {
          return;
        }

        if (ingredient) {
          onOpenRef.current(ingredient as IIngredient);
        }
      } catch (error: unknown) {
        if (controller.signal.aborted) {
          return;
        }

        logger.error('Failed to resolve deep-linked ingredient', error);
      } finally {
        if (!controller.signal.aborted) {
          clearAssetDeepLink();
        }
      }
    };

    void fetchDeepLinkedIngredient();

    return () => controller.abort();
  }, [
    assetId,
    clearAssetDeepLink,
    getIngredientsService,
    isLoading,
    loadedIngredient,
  ]);

  return { assetId, clearAssetDeepLink };
}
