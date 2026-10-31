'use client';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useEffect, useMemo, useState } from 'react';

/** The ingredients batch endpoint reads at most this many ids per request. */
const BATCH_LIMIT = 50;
const EMPTY: ReadonlyMap<string, IIngredient> = new Map();

/**
 * Loads the Library outputs a page of receipts describes, so the list can show
 * each media receipt's thumbnail. Previews are optional: a failed or deleted
 * output leaves its row without one instead of failing the list.
 */
export function useGenerationReceiptMedia(
  ingredientIds: readonly string[],
): ReadonlyMap<string, IIngredient> {
  // The ingredients client loads with the first media page, not with the
  // receipts route, so the token is resolved here and the client lazily.
  const getToken = useAuthedService((token) => token);
  const key = useMemo(
    () => [...new Set(ingredientIds)].sort().join(','),
    [ingredientIds],
  );
  const [media, setMedia] = useState<ReadonlyMap<string, IIngredient>>(EMPTY);

  useEffect(() => {
    const controller = new AbortController();
    if (!key) return () => controller.abort();
    const ids = key.split(',');
    const load = async () => {
      try {
        const [token, { IngredientsService }] = await Promise.all([
          getToken(),
          import('@genfeedai/services/content/ingredients.service'),
        ]);
        if (controller.signal.aborted) return;
        const service = IngredientsService.getInstance(token);
        const batches: string[][] = [];
        for (let index = 0; index < ids.length; index += BATCH_LIMIT)
          batches.push(ids.slice(index, index + BATCH_LIMIT));
        const found = (
          await Promise.all(batches.map((batch) => service.findByIds(batch)))
        ).flat();
        if (controller.signal.aborted) return;
        setMedia(
          new Map(
            found
              .filter((ingredient) => !ingredient.isDeleted)
              .map((ingredient) => [ingredient.id, ingredient]),
          ),
        );
      } catch {
        // Rows render without previews; the receipts themselves still load.
      }
    };
    void load();
    return () => controller.abort();
  }, [key, getToken]);

  // Lookups are by id, so the previous page's map stays usable while a
  // longer list reloads instead of blanking every thumbnail.
  return key ? media : EMPTY;
}
