'use client';

import type { IIngredientGenerationCost } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useEffect, useState } from 'react';

interface CostSnapshot {
  cost: IIngredientGenerationCost | null;
  ingredientId: string;
}

/**
 * What a generated asset cost in credits. Nothing loads when `isEnabled` is
 * false, state from a previous asset is never shown for the current one, and a
 * change aborts the request in flight. A failed read shows no cost: the figure
 * is informational and never blocks the details panel.
 */
export function useIngredientGenerationCost(
  ingredientId: string,
  isEnabled: boolean,
): IIngredientGenerationCost | null {
  const getIngredientsService = useAuthedService((token) =>
    IngredientsService.getInstance(token),
  );
  const [snapshot, setSnapshot] = useState<CostSnapshot | null>(null);

  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    const controller = new AbortController();

    async function load() {
      try {
        const service = await getIngredientsService();
        const cost = await service.findGenerationCost(
          ingredientId,
          controller.signal,
        );

        if (!controller.signal.aborted) {
          setSnapshot({ cost, ingredientId });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        logger.error(
          `GET /ingredients/${ingredientId}/generation-cost failed`,
          error,
        );
        setSnapshot({ cost: null, ingredientId });
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [getIngredientsService, ingredientId, isEnabled]);

  return isEnabled && snapshot?.ingredientId === ingredientId
    ? snapshot.cost
    : null;
}
