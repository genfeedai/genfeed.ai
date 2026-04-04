import type { IIngredient } from '@cloud/interfaces';
import type { MasonryActionStates } from '@cloud/interfaces/hooks/hooks.interface';
import { IngredientCategory, ModelKey } from '@genfeedai/enums';
import { formatNumberWithCommas } from '@helpers/formatting/format/format.helper';
import { useElements } from '@hooks/data/elements/use-elements/use-elements';
import {
  executeSilentWithActionState,
  executeWithActionState,
} from '@hooks/utils/service-operation/service-operation.util';
import { NotificationsService } from '@services/core/notifications.service';
import type { ImagesService } from '@services/ingredients/images.service';
import type { VideosService } from '@services/ingredients/videos.service';
import {
  isImageIngredient,
  isVideoIngredient,
} from '@utils/media/ingredient-type.util';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useMemo, useState } from 'react';

export interface UseEnhanceUpscaleParams {
  onRefresh?: () => void | Promise<void>;
  autoConfirm?: boolean; // not used here (parent typically opens confirm), kept for parity
  getVideosService: () => Promise<VideosService>;
  getImagesService: () => Promise<ImagesService>;
  setActionStates: Dispatch<SetStateAction<MasonryActionStates>>;
}

export function useEnhanceUpscale({
  onRefresh,
  getVideosService,
  getImagesService,
  setActionStates,
}: UseEnhanceUpscaleParams) {
  const notificationsService = NotificationsService.getInstance();

  // Get models for cost lookup
  const { imageEditModels, videoEditModels } = useElements();

  // State for confirm modals
  const [enhanceConfirmData, setEnhanceConfirmData] = useState<{
    ingredient: IIngredient | null;
    cost: number;
    modelKey: ModelKey;
  } | null>(null);

  const [upscaleConfirmData, setUpscaleConfirmData] = useState<{
    ingredient: IIngredient | null;
    cost: number;
    modelKey: ModelKey;
  } | null>(null);

  const handleUpscale = useCallback(
    async (ingredient: IIngredient) => {
      const isVideo = isVideoIngredient(ingredient);
      const isImage = isImageIngredient(ingredient);

      if (!isVideo && !isImage) {
        return notificationsService.error(
          'Cannot upscale this ingredient type',
        );
      }

      const models = isVideo ? videoEditModels : imageEditModels;
      const topazModel = models.find(
        (model) =>
          model.key ===
          (isVideo
            ? ModelKey.REPLICATE_TOPAZ_VIDEO_UPSCALE
            : ModelKey.REPLICATE_TOPAZ_IMAGE_UPSCALE),
      );

      if (!topazModel) {
        return notificationsService.error('Topaz upscale model not available');
      }

      const cost = topazModel.cost || 0;

      setUpscaleConfirmData({
        cost,
        ingredient,
        modelKey: topazModel.key as ModelKey,
      });
    },
    [videoEditModels, imageEditModels, notificationsService],
  );

  const executeUpscale = useCallback(async () => {
    if (!upscaleConfirmData?.ingredient) {
      return;
    }

    const ingredient = upscaleConfirmData.ingredient;
    const isVideo = isVideoIngredient(ingredient);
    const isImage = isImageIngredient(ingredient);

    if (!isVideo && !isImage) {
      return notificationsService.error('Cannot upscale this ingredient type');
    }

    setUpscaleConfirmData(null);

    await executeSilentWithActionState({
      errorMessage: 'Failed to upscale ingredient',
      onSuccess: onRefresh,
      operation: async () => {
        if (isVideo) {
          const service = await getVideosService();
          return service.postUpscale(ingredient.id, {
            model: ModelKey.REPLICATE_TOPAZ_VIDEO_UPSCALE,
            targetFps: 30,
            targetResolution: '1080p',
          });
        } else {
          const service = await getImagesService();
          return service.postUpscale(ingredient.id, {
            faceEnhancement: true,
            model: ModelKey.REPLICATE_TOPAZ_IMAGE_UPSCALE,
            subjectDetection: 'Foreground',
            upscaleFactor: '4x',
          });
        }
      },
      setActionStates,
      stateKey: 'isUpscaling',
      url: `POST /${isVideo ? 'videos' : 'images'}/${ingredient.id}/upscale`,
    });
  }, [
    upscaleConfirmData,
    getVideosService,
    getImagesService,
    notificationsService,
    onRefresh,
    setActionStates,
  ]);

  const clearUpscaleConfirm = useCallback(() => {
    setUpscaleConfirmData(null);
  }, []);

  const handleEnhance = useCallback(
    async (ingredient: IIngredient) => {
      const isVideo = isVideoIngredient(ingredient);
      const isImage = isImageIngredient(ingredient);

      if (!isVideo && !isImage) {
        return notificationsService.error('Can only enhance images and videos');
      }

      const models = isVideo ? videoEditModels : imageEditModels;
      const topazModel = models.find(
        (model) =>
          model.key ===
          (isVideo
            ? ModelKey.REPLICATE_TOPAZ_VIDEO_UPSCALE
            : ModelKey.REPLICATE_TOPAZ_IMAGE_UPSCALE),
      );

      if (!topazModel) {
        return notificationsService.error('Topaz upscale model not available');
      }

      const cost = topazModel.cost || 0;

      setEnhanceConfirmData({
        cost,
        ingredient,
        modelKey: topazModel.key as ModelKey,
      });
    },
    [videoEditModels, imageEditModels, notificationsService],
  );

  const executeEnhance = useCallback(async () => {
    if (!enhanceConfirmData?.ingredient) {
      return;
    }

    const ingredient = enhanceConfirmData.ingredient;
    const isVideo = isVideoIngredient(ingredient);
    const modelKey = enhanceConfirmData.modelKey;

    setEnhanceConfirmData(null);

    await executeWithActionState({
      errorMessage: 'Failed to enhance ingredient',
      onSuccess: onRefresh,
      operation: async () => {
        const service = isVideo
          ? await getVideosService()
          : await getImagesService();

        const payload: any = {
          category: isVideo
            ? IngredientCategory.VIDEO
            : IngredientCategory.IMAGE,
          model: modelKey,
          parent: ingredient.id,
          prompt: 'Enhance image quality using Topaz AI upscaling',
        };

        if (isVideo) {
          return (service as VideosService).postUpscale(ingredient.id, payload);
        } else {
          return (service as ImagesService).postUpscale(ingredient.id, payload);
        }
      },
      setActionStates,
      stateKey: 'isEnhancing',
      successMessage: 'Enhance started successfully',
      url: `POST /${isVideo ? 'videos' : 'images'}/${ingredient.id}/upscale [Topaz]`,
    });
  }, [
    enhanceConfirmData,
    getVideosService,
    getImagesService,
    onRefresh,
    setActionStates,
  ]);

  const clearEnhanceConfirm = useCallback(() => {
    setEnhanceConfirmData(null);
  }, []);

  const formatConfirmMessage = (
    action: string,
    data: { ingredient: IIngredient | null; cost: number } | null,
  ): string => {
    if (!data) {
      return '';
    }
    const category =
      data.ingredient?.category === IngredientCategory.VIDEO
        ? IngredientCategory.VIDEO
        : IngredientCategory.IMAGE;
    return `${action} ${category} with Topaz AI?\n\nThis will cost ${formatNumberWithCommas(data.cost)} credits.`;
  };

  const enhanceConfirmMessage = useMemo(
    () => formatConfirmMessage('Enhance', enhanceConfirmData),
    [enhanceConfirmData, formatConfirmMessage],
  );

  const upscaleConfirmMessage = useMemo(
    () => formatConfirmMessage('Upscale', upscaleConfirmData),
    [upscaleConfirmData, formatConfirmMessage],
  );

  return {
    clearEnhanceConfirm,
    // Cancel helpers
    clearUpscaleConfirm,
    enhanceConfirmData,
    enhanceConfirmMessage,
    executeEnhance,
    // Executors
    executeUpscale,
    handleEnhance,
    // Trigger
    handleUpscale,
    // Confirm data and messages
    upscaleConfirmData,
    upscaleConfirmMessage,
  };
}
