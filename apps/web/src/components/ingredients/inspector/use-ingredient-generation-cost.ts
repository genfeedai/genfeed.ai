'use client';

import type { IIngredientGenerationCost } from '@genfeedai/contracts/interfaces';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';

/**
 * What a generated asset cost in credits. Nothing loads when `isEnabled` is
 * false, a cost from a previous asset is never shown for the current one, and
 * a change aborts the request in flight. Reopening an asset paints its cached
 * cost at once and refreshes it in the background (a reserved cost settles).
 * A failed read shows no cost: the figure is informational and never blocks
 * the details panel.
 */
export function useIngredientGenerationCost(
  ingredientId: string,
  isEnabled: boolean,
): IIngredientGenerationCost | null {
  const costQuery = useAuthedQuery<
    IngredientsService,
    IIngredientGenerationCost
  >({
    enabled: isEnabled,
    queryFn: async (service, signal) => {
      try {
        return await service.findGenerationCost(ingredientId, signal);
      } catch (error) {
        if (!signal.aborted) {
          logger.error(
            `GET /ingredients/${ingredientId}/generation-cost failed`,
            error,
          );
        }
        throw error;
      }
    },
    queryKey: ['ingredient-generation-cost', ingredientId],
    service: (token: string) => IngredientsService.getInstance(token),
  });

  return isEnabled ? (costQuery.data ?? null) : null;
}
