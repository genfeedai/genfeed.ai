'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { ImagesService } from '@services/ingredients/images.service';
import { VideosService } from '@services/ingredients/videos.service';
import type {
  WorkflowMediaConfig,
  WorkflowMediaKind,
} from '@/features/workflows/nodes/input/media-picker';
import { useIngredientMediaUrl } from '@/hooks/media/use-ingredient-media-url';

function createMediaServices(token: string) {
  return {
    image: ImagesService.getInstance(token),
    video: VideosService.getInstance(token),
  };
}

/** Saved Library IDs are reauthorized; stored preview URLs can have expired. */
export function useWorkflowMediaPreviewUrl(
  kind: WorkflowMediaKind,
  config: WorkflowMediaConfig,
): string | undefined {
  const { brandId } = useBrand();
  const { itemId } = config;
  const isIngredient =
    config.source !== 'url' &&
    (config.itemCategory !== 'reference' || kind === 'video') &&
    Boolean(itemId);
  const query = useAuthedQuery<
    ReturnType<typeof createMediaServices>,
    IIngredient | null
  >({
    enabled: Boolean(brandId) && isIngredient,
    queryFn: async (services, signal) => {
      if (!brandId || !itemId) return null;
      const ingredient = await services[kind].findOne(
        itemId,
        { brandId, isDeleted: false },
        signal,
      );
      return ingredient.id === itemId &&
        ingredient.brandId === brandId &&
        !ingredient.isDeleted
        ? ingredient
        : null;
    },
    queryKey: ['workflow-media-preview', kind, itemId, brandId],
    service: createMediaServices,
  });
  const ingredient =
    isIngredient &&
    query.data?.id === itemId &&
    query.data.brandId === brandId &&
    !query.data.isDeleted
      ? query.data
      : null;
  const authorizedUrl = useIngredientMediaUrl(ingredient);
  return isIngredient ? authorizedUrl : (config.resolvedUrl ?? undefined);
}
