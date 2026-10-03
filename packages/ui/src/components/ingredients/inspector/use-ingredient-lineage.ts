'use client';

import {
  INGREDIENT_LINEAGE_PAGE_SIZE,
  type IngredientLineageDirection,
} from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { UseIngredientLineageResult } from '@genfeedai/props/content/ingredient.props';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useCallback, useEffect, useState } from 'react';

interface LineageSnapshot {
  hasError: boolean;
  hasNext: boolean;
  hiddenCount: number;
  identity: string;
  isLoading: boolean;
  items: IIngredient[];
}

interface LineageRequest {
  identity: string;
  page: number;
}

function emptySnapshot(identity: string): LineageSnapshot {
  return {
    hasError: false,
    hasNext: false,
    hiddenCount: 0,
    identity,
    isLoading: true,
    items: [],
  };
}

/**
 * One direction of an asset's lineage, a page at a time. The first page loads
 * when the asset or direction changes; `loadMore` appends the next page. State
 * from a previous asset is never shown for the current one, and a change aborts
 * the request in flight.
 */
export function useIngredientLineage(
  ingredientId: string,
  direction: IngredientLineageDirection,
): UseIngredientLineageResult {
  const getIngredientsService = useAuthedService((token) =>
    IngredientsService.getInstance(token),
  );
  const identity = `${ingredientId}\u0001${direction}`;
  const [snapshot, setSnapshot] = useState<LineageSnapshot>(() =>
    emptySnapshot(identity),
  );
  const [request, setRequest] = useState<LineageRequest>({
    identity,
    page: 1,
  });
  const page = request.identity === identity ? request.page : 1;

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setSnapshot((current) =>
        current.identity === identity
          ? { ...current, hasError: false, isLoading: true }
          : emptySnapshot(identity),
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

        setSnapshot((current) => ({
          hasError: false,
          hasNext: result.hasNext,
          hiddenCount: result.hiddenCount,
          identity,
          isLoading: false,
          items:
            page === 1 || current.identity !== identity
              ? result.items
              : [...current.items, ...result.items],
        }));
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        logger.error(
          `GET /ingredients/${ingredientId}/lineage/${direction} failed`,
          error,
        );
        setSnapshot((current) => ({
          ...(current.identity === identity
            ? current
            : emptySnapshot(identity)),
          hasError: true,
          isLoading: false,
        }));
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [direction, getIngredientsService, identity, ingredientId, page]);

  const loadMore = useCallback(() => {
    setRequest({ identity, page: page + 1 });
  }, [identity, page]);

  const current =
    snapshot.identity === identity ? snapshot : emptySnapshot(identity);

  return {
    hasError: current.hasError,
    hasNext: current.hasNext,
    hiddenCount: current.hiddenCount,
    isLoading: current.isLoading,
    items: current.items,
    loadMore,
  };
}
