import { IngredientCategory } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { IImageEditParams } from '@genfeedai/contracts/interfaces/components/image-edit.interface';
import type { IVideoEditParams } from '@genfeedai/contracts/interfaces/components/video-operations.interface';
import type { MasonryActionStates } from '@genfeedai/contracts/interfaces/hooks/hooks.interface';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import type { ImagesService } from '@genfeedai/services/ingredients/images.service';
import type { VideosService } from '@genfeedai/services/ingredients/videos.service';
import {
  isImageIngredient,
  isVideoIngredient,
} from '@genfeedai/utils/media/ingredient-type.util';
import { formatNumberWithCommas } from '@helpers/formatting/format/format.helper';
import { useElements } from '@hooks/data/elements/use-elements/use-elements';
import {
  executeSilentWithActionState,
  executeWithActionState,
} from '@hooks/utils/service-operation/service-operation.util';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useMemo, useState } from 'react';

const TOPAZ_ENHANCE_PROMPT = 'Enhance image quality using Topaz AI upscaling';

type TopazImageEnhancePayload = IImageEditParams & {
  category: IngredientCategory.IMAGE;
  parent: string;
};

type TopazVideoEnhancePayload = IVideoEditParams & {
  category: IngredientCategory.VIDEO;
  parent: string;
};

export interface VideoUpscaleSelection {
  cost: number;
  model: string;
  targetFps: number;
  targetResolution: string;
}

export interface VideoUpscaleModelOption {
  cost: number;
  fps: readonly number[];
  key: string;
  label: string;
  resolutions: readonly string[];
}

export interface UpscaleConfirmData {
  ingredient: IIngredient | null;
  cost: number;
  modelKey: string;
  videoModelOptions?: VideoUpscaleModelOption[];
}

const VIDEO_UPSCALE_MODEL_CAPABILITIES: Record<
  string,
  Pick<VideoUpscaleModelOption, 'fps' | 'resolutions'>
> = {
  [MODEL_KEYS.REPLICATE_BYTEDANCE_VIDEO_UPSCALER]: {
    fps: [24, 30, 60, 120],
    resolutions: ['720p', '1080p', '2k', '4k'],
  },
  [MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE]: {
    fps: [15, 24, 30, 60],
    resolutions: ['720p', '1080p', '4k'],
  },
};

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
    modelKey: string;
  } | null>(null);

  const [upscaleConfirmData, setUpscaleConfirmData] =
    useState<UpscaleConfirmData | null>(null);

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
            ? MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE
            : MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE),
      );

      const videoModelOptions = isVideo
        ? models.flatMap((model) => {
            const capabilities = VIDEO_UPSCALE_MODEL_CAPABILITIES[model.key];
            if (!capabilities) {
              return [];
            }
            return [
              {
                ...capabilities,
                cost: model.cost || 0,
                key: model.key,
                label: model.label,
              },
            ];
          })
        : undefined;
      const selectedModel = isVideo
        ? (topazModel ??
          models.find((model) => VIDEO_UPSCALE_MODEL_CAPABILITIES[model.key]))
        : topazModel;
      if (!selectedModel) {
        return notificationsService.error('Upscale model not available');
      }
      const cost = selectedModel.cost || 0;

      setUpscaleConfirmData({
        cost,
        ingredient,
        modelKey: selectedModel.key as string,
        ...(videoModelOptions ? { videoModelOptions } : {}),
      });
    },
    [videoEditModels, imageEditModels, notificationsService],
  );

  const executeUpscale = useCallback(
    async (selection?: VideoUpscaleSelection) => {
      if (!upscaleConfirmData?.ingredient) {
        return;
      }

      const ingredient = upscaleConfirmData.ingredient;
      const isVideo = isVideoIngredient(ingredient);
      const isImage = isImageIngredient(ingredient);

      if (!isVideo && !isImage) {
        return notificationsService.error(
          'Cannot upscale this ingredient type',
        );
      }

      setUpscaleConfirmData(null);

      await executeSilentWithActionState({
        errorMessage: 'Failed to upscale ingredient',
        onSuccess: onRefresh,
        operation: async () => {
          if (isVideo) {
            const service = await getVideosService();
            return service.postUpscale(ingredient.id, {
              model: selection?.model ?? upscaleConfirmData.modelKey,
              targetFps: selection?.targetFps ?? 30,
              targetResolution: selection?.targetResolution ?? '1080p',
            });
          } else {
            const service = await getImagesService();
            return service.postUpscale(ingredient.id, {
              faceEnhancement: true,
              model: MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
              subjectDetection: 'Foreground',
              upscaleFactor: '4x',
            });
          }
        },
        setActionStates,
        stateKey: 'isUpscaling',
        url: `POST /${isVideo ? 'videos' : 'images'}/${ingredient.id}/upscale`,
      });
    },
    [
      upscaleConfirmData,
      getVideosService,
      getImagesService,
      notificationsService,
      onRefresh,
      setActionStates,
    ],
  );

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
            ? MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE
            : MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE),
      );

      if (!topazModel) {
        return notificationsService.error('Topaz upscale model not available');
      }

      const cost = topazModel.cost || 0;

      setEnhanceConfirmData({
        cost,
        ingredient,
        modelKey: topazModel.key as string,
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
        if (isVideo) {
          const service = await getVideosService();
          const payload: TopazVideoEnhancePayload = {
            category: IngredientCategory.VIDEO,
            model: modelKey,
            parent: ingredient.id,
            prompt: TOPAZ_ENHANCE_PROMPT,
          };

          return service.postUpscale(ingredient.id, payload);
        }

        const service = await getImagesService();
        const payload: TopazImageEnhancePayload = {
          category: IngredientCategory.IMAGE,
          model: modelKey,
          parent: ingredient.id,
          prompt: TOPAZ_ENHANCE_PROMPT,
        };

        return service.postUpscale(ingredient.id, payload);
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

  const formatConfirmMessage = useCallback(
    (
      action: string,
      data: { ingredient: IIngredient | null; cost: number } | null,
    ): string => {
      if (!data) {
        return '';
      }
      // Spelled out rather than interpolating the enum: IngredientCategory
      // carries Prisma's SCREAMING_SNAKE labels (#2473), which read as
      // "Upscale IMAGE with Topaz AI?" in a dialog shown to the user.
      const noun =
        data.ingredient?.category === IngredientCategory.VIDEO
          ? 'video'
          : 'image';
      return `${action} ${noun} with Topaz AI?\n\nThis will cost ${formatNumberWithCommas(data.cost)} credits.`;
    },
    [],
  );

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
