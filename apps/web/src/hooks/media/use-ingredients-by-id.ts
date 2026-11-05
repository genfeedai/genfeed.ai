import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useEffect, useMemo } from 'react';

const BATCH_SIZE = 50;
const EMPTY_INGREDIENTS = new Map<string, IIngredient>();

function createIngredientsService(token: string): IngredientsService {
  return IngredientsService.getInstance(token);
}

/**
 * Reads ingredients by id for surfaces that only hold ids (character avatars and
 * references, filter options). A raw CDN path is not readable on Cloud, so the
 * ingredients are read once to get the URLs and media grants the API issues.
 *
 * The read is cached per viewer and id set, so reopening a surface paints its
 * images at once and refreshes them in the background. While a changed id set
 * loads, the images already read for this viewer stay on screen.
 */
export function useIngredientsById(
  ingredientIds: readonly string[],
): Map<string, IIngredient> {
  const { orgId, userId } = useAuthIdentity();
  const ids = useMemo(
    () => [...new Set(ingredientIds)].sort(),
    [ingredientIds],
  );
  const hasIds = ids.length > 0;
  // The viewer is part of the prefix too, so the images kept on screen while
  // the next id set loads are always this viewer's.
  const viewerScope = ['ingredients-by-id', orgId ?? null, userId ?? null];

  const query = useAuthedQuery<IngredientsService, Map<string, IIngredient>>({
    enabled: hasIds,
    keepPreviousDataWithin: viewerScope,
    queryFn: async (service) => {
      const loaded = new Map<string, IIngredient>();
      for (let start = 0; start < ids.length; start += BATCH_SIZE) {
        const batch = await service.findByIds(
          ids.slice(start, start + BATCH_SIZE),
        );
        for (const ingredient of batch) {
          loaded.set(ingredient.id, ingredient);
        }
      }
      return loaded;
    },
    queryKey: [...viewerScope, ids.join(',')],
    service: createIngredientsService,
  });

  const { error } = query;
  useEffect(() => {
    if (error) {
      logger.error('Failed to load character images', error);
    }
  }, [error]);

  return (hasIds ? query.data : undefined) ?? EMPTY_INGREDIENTS;
}
