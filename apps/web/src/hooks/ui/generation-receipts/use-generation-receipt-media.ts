'use client';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useMemo } from 'react';

/** The ingredients batch endpoint reads at most this many ids per request. */
const BATCH_LIMIT = 50;
const EMPTY: ReadonlyMap<string, IIngredient> = new Map();
const MEDIA_SCOPE_KEY = ['generation-receipt-media'] as const;

function toBatches(ids: readonly string[]): string[][] {
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += BATCH_LIMIT) {
    batches.push(ids.slice(index, index + BATCH_LIMIT));
  }
  return batches;
}

/**
 * Loads the Library outputs a page of receipts describes, so the list can show
 * each media receipt's thumbnail. Previews are optional: a failed or deleted
 * output leaves its row without one instead of failing the list. The outputs
 * are cached per set of ids, so returning to a page paints its thumbnails at
 * once.
 */
export function useGenerationReceiptMedia(
  ingredientIds: readonly string[],
): ReadonlyMap<string, IIngredient> {
  const key = useMemo(
    () => [...new Set(ingredientIds)].sort().join(','),
    [ingredientIds],
  );

  const mediaQuery = useAuthedQuery<string, IIngredient[]>({
    enabled: Boolean(key),
    // Lookups are by id, so the previous page's outputs stay usable while a
    // longer list reloads instead of blanking every thumbnail.
    keepPreviousDataWithin: MEDIA_SCOPE_KEY,
    queryFn: async (token) => {
      // The ingredients client loads with the first media page, not with the
      // receipts route.
      const { IngredientsService } = await import(
        '@genfeedai/services/content/ingredients.service'
      );
      const service = IngredientsService.getInstance(token);
      const found = await Promise.all(
        toBatches(key.split(',')).map((batch) => service.findByIds(batch)),
      );
      return found.flat().filter((ingredient) => !ingredient.isDeleted);
    },
    queryKey: [...MEDIA_SCOPE_KEY, key],
    service: (token: string) => token,
  });

  const outputs = mediaQuery.data;
  const media = useMemo(
    () =>
      outputs
        ? new Map(outputs.map((ingredient) => [ingredient.id, ingredient]))
        : EMPTY,
    [outputs],
  );

  return key ? media : EMPTY;
}
