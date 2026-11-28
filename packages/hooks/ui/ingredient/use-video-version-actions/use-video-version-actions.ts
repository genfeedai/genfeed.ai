import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { MasonryActionStates } from '@genfeedai/contracts/interfaces/hooks/hooks.interface';
import type { NotificationsService } from '@genfeedai/services/core/notifications.service';
import type { VideosService } from '@genfeedai/services/ingredients/videos.service';
import { isVideoIngredient } from '@genfeedai/utils/media/ingredient-type.util';
import { useVideoVersionRefresh } from '@hooks/ui/ingredient/use-video-version-refresh/use-video-version-refresh';
import { executeSilentWithActionState } from '@hooks/utils/service-operation/service-operation.util';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';

interface UseVideoVersionActionsParams {
  getVideosService: () => Promise<VideosService>;
  notificationsService: NotificationsService;
  onRefresh?: () => void | Promise<void>;
  setActionStates: Dispatch<SetStateAction<MasonryActionStates>>;
}

/** Reverse and mirror: each makes a new linked version of a video. */
export function useVideoVersionActions({
  getVideosService,
  notificationsService,
  onRefresh,
  setActionStates,
}: UseVideoVersionActionsParams) {
  const refreshWhenVersionReady = useVideoVersionRefresh({ onRefresh });

  const handleReverse = useCallback(
    async (ingredient: IIngredient) => {
      if (!isVideoIngredient(ingredient)) {
        return notificationsService.error('Can only reverse videos');
      }

      await executeSilentWithActionState<unknown, MasonryActionStates>({
        errorMessage: 'Failed to reverse video',
        onSuccess: (version) =>
          refreshWhenVersionReady(version as IIngredient | undefined),
        operation: async () => {
          const service = await getVideosService();
          return service.postReverse(ingredient.id);
        },
        setActionStates,
        stateKey: 'isReversing',
        url: `POST /videos/${ingredient.id}/reverse`,
      });
    },
    [
      getVideosService,
      notificationsService,
      refreshWhenVersionReady,
      setActionStates,
    ],
  );

  const handleMirror = useCallback(
    async (ingredient: IIngredient) => {
      if (!isVideoIngredient(ingredient)) {
        return notificationsService.error('Can only mirror videos');
      }

      await executeSilentWithActionState<unknown, MasonryActionStates>({
        errorMessage: 'Failed to mirror video',
        onSuccess: (version) =>
          refreshWhenVersionReady(version as IIngredient | undefined),
        operation: async () => {
          const service = await getVideosService();
          return service.postMirror(ingredient.id);
        },
        setActionStates,
        stateKey: 'isMirroring',
        url: `POST /videos/${ingredient.id}/mirror`,
      });
    },
    [
      getVideosService,
      notificationsService,
      refreshWhenVersionReady,
      setActionStates,
    ],
  );

  return { handleMirror, handleReverse };
}
