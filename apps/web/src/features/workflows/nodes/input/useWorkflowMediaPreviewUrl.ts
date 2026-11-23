'use client';

import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { IngredientsService } from '@services/content/ingredients.service';
import type { WorkflowMediaConfig } from '@/features/workflows/nodes/input/media-picker';

const PREVIEW_STALE_TIME_MS = 5 * 60_000;

/**
 * URL the node previews its selected media from.
 *
 * A Library image or video is private, so the URL saved in the node (the bare
 * CDN path, or a grant that has since expired) answers 403. The preview asks
 * the API for the ingredient instead, which returns a fresh grant. Pasted URLs
 * and brand references are previewed from the saved URL as they are.
 */
export function useWorkflowMediaPreviewUrl(
  config: WorkflowMediaConfig,
): string | null {
  const ingredientId =
    config.source !== 'url' &&
    (config.itemCategory === 'image' || config.itemCategory === 'video')
      ? config.itemId
      : null;

  const ingredient = useAuthedQuery<IngredientsService, string | null>({
    enabled: ingredientId !== null,
    queryFn: async (service, signal) =>
      (await service.findOne(ingredientId ?? '', {}, signal)).ingredientUrl ??
      null,
    queryKey: ['workflow-media-preview', ingredientId],
    service: (token: string) => IngredientsService.getInstance(token),
    staleTime: PREVIEW_STALE_TIME_MS,
  });

  if (ingredientId === null) {
    return config.resolvedUrl;
  }

  // While the grant loads there is nothing safe to show: the saved URL is the
  // one that returns 403. If the read fails, the saved URL is the last resort.
  return ingredient.data ?? (ingredient.isError ? config.resolvedUrl : null);
}
