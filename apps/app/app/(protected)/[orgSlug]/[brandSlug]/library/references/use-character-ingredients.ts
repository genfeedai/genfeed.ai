import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import { useEffect, useMemo, useState } from 'react';

const BATCH_SIZE = 50;

/**
 * Character avatars and references are stored as ingredient ids. A raw CDN path
 * is not readable on Cloud, so the ingredients are read once to get the URLs
 * and media grants the API issues for them.
 */
export function useCharacterIngredients(
  ingredientIds: readonly string[],
): Map<string, IIngredient> {
  const getService = useAuthedService((token) =>
    IngredientsService.getInstance(token),
  );
  const [ingredients, setIngredients] = useState<Map<string, IIngredient>>(
    () => new Map(),
  );
  const idsKey = useMemo(
    () => [...new Set(ingredientIds)].sort().join(','),
    [ingredientIds],
  );

  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : [];
    if (ids.length === 0) {
      setIngredients(new Map());
      return;
    }
    let isCancelled = false;
    void (async () => {
      try {
        const service = await getService();
        const loaded = new Map<string, IIngredient>();
        for (let start = 0; start < ids.length; start += BATCH_SIZE) {
          const batch = await service.findByIds(
            ids.slice(start, start + BATCH_SIZE),
          );
          for (const ingredient of batch) {
            loaded.set(ingredient.id, ingredient);
          }
        }
        if (!isCancelled) {
          setIngredients(loaded);
        }
      } catch (error) {
        if (!isCancelled) {
          logger.error('Failed to load character images', error);
        }
      }
    })();
    return () => {
      isCancelled = true;
    };
  }, [getService, idsKey]);

  return ingredients;
}
