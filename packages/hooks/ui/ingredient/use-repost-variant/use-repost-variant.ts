import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { IVideoRepostVariantParams } from '@genfeedai/contracts/interfaces/components/video-operations.interface';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import type { VideosService } from '@genfeedai/services/ingredients/videos.service';
import { isVideoIngredient } from '@genfeedai/utils/media/ingredient-type.util';
import { useIngredientServices } from '@hooks/data/ingredients/use-ingredient-services/use-ingredient-services';
import { useVideoVersionRefresh } from '@hooks/ui/ingredient/use-video-version-refresh/use-video-version-refresh';
import { withServiceOperation } from '@hooks/utils/service-operation/service-operation.util';
import { useCallback, useState } from 'react';

interface UseRepostVariantOptions {
  onRefresh?: () => void | Promise<void>;
}

/**
 * Holds the video a "Repost variant" is being made from, and sends the picked
 * changes once the person confirms. The result arrives as a linked version.
 */
export function useRepostVariant({ onRefresh }: UseRepostVariantOptions = {}) {
  const { getVideosService } = useIngredientServices();
  const refreshWhenVersionReady = useVideoVersionRefresh({ onRefresh });
  const [repostVariantIngredient, setRepostVariantIngredient] =
    useState<IIngredient | null>(null);

  const handleRepostVariant = useCallback((ingredient: IIngredient) => {
    if (!isVideoIngredient(ingredient)) {
      NotificationsService.getInstance().error(
        'Can only make variants of videos',
      );
      return;
    }
    setRepostVariantIngredient({ ...ingredient });
  }, []);

  const clearRepostVariant = useCallback(() => {
    setRepostVariantIngredient(null);
  }, []);

  const executeRepostVariant = useCallback(
    async (params: IVideoRepostVariantParams) => {
      if (!repostVariantIngredient) {
        return;
      }
      const { id } = repostVariantIngredient;
      await withServiceOperation({
        errorMessage: 'Failed to create the repost variant',
        onSuccess: refreshWhenVersionReady,
        operation: async () => {
          const service = (await getVideosService()) as VideosService;
          return service.postRepostVariant(id, params);
        },
        successMessage: 'Repost variant started. It will appear as a version.',
        url: `POST /videos/${id}/repost-variant`,
      });
      setRepostVariantIngredient(null);
    },
    [getVideosService, refreshWhenVersionReady, repostVariantIngredient],
  );

  return {
    clearRepostVariant,
    executeRepostVariant,
    handleRepostVariant,
    repostVariantIngredient,
  };
}
