'use client';

import type {
  IIngredient,
  ImageToVideoGenerationPayload,
  ITag,
} from '@cloud/interfaces';
import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import {
  IngredientFormat,
  IngredientStatus,
  ModalEnum,
} from '@genfeedai/enums';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useElements } from '@hooks/data/elements/use-elements/use-elements';
import { isIngredientFormat } from '@hooks/data/ingredients/use-ingredients-list/use-ingredients-filters';
import { logger } from '@services/core/logger.service';
import type { NotificationsService } from '@services/core/notifications.service';
import { VideosService } from '@services/ingredients/videos.service';
import { useCallback, useState } from 'react';

interface UseIngredientsGenerationProps {
  notificationsService: NotificationsService;
  findAllIngredientsByCategory: (
    isRefreshing?: boolean,
    signal?: AbortSignal,
  ) => Promise<void>;
}

export function useIngredientsGeneration({
  notificationsService,
  findAllIngredientsByCategory,
}: UseIngredientsGenerationProps) {
  const {
    videoModels,
    presets,
    moods,
    styles,
    cameras,
    sounds,
    tags: availableTags,
    fontFamilies,
    blacklists,
  } = useElements({ type: 'video' });

  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );

  const [imageToVideoTarget, setImageToVideoTarget] =
    useState<IIngredient | null>(null);
  const [imageToVideoPromptData, setImageToVideoPromptData] = useState<
    Partial<PromptTextareaSchema> & { isValid: boolean }
  >({ isValid: false, text: '' });
  const [isImageToVideoGenerating, setIsImageToVideoGenerating] =
    useState(false);

  const handleConvertToVideo = useCallback(
    (ingredient: IIngredient) => {
      if (!ingredient) {
        return;
      }

      if (ingredient.status === IngredientStatus.PROCESSING) {
        return notificationsService.info(
          'Please wait until the image has finished processing',
        );
      }

      const defaultModelKey = videoModels[0]?.key;
      const format = ingredient.ingredientFormat || IngredientFormat.PORTRAIT;

      const fallbackDimensions = {
        [IngredientFormat.LANDSCAPE]: { height: 1080, width: 1920 },
        [IngredientFormat.SQUARE]: { height: 1024, width: 1024 },
        [IngredientFormat.PORTRAIT]: { height: 1920, width: 1080 },
      } as const;

      const fallback =
        fallbackDimensions[format] ||
        fallbackDimensions[IngredientFormat.PORTRAIT];

      setImageToVideoTarget(ingredient);
      setImageToVideoPromptData({
        format,
        height: ingredient.metadataHeight || fallback.height,
        isValid: Boolean(ingredient?.promptText?.trim() ?? false),
        models: defaultModelKey ? [defaultModelKey] : [],
        references: [ingredient.id],
        text: ingredient.promptText,
        width: ingredient.metadataWidth || fallback.width,
      });
      setIsImageToVideoGenerating(false);

      openModal(ModalEnum.IMAGE_TO_VIDEO);
    },
    [notificationsService, videoModels],
  );

  const handleImageToVideoPromptChange = useCallback(
    (data: Partial<PromptTextareaSchema> & { isValid: boolean }) => {
      setImageToVideoPromptData((prev) => {
        const nextData = { ...prev, ...data };

        if (imageToVideoTarget?.id) {
          const references = new Set<string>();
          references.add(imageToVideoTarget.id);

          const incoming =
            (data.references as string[] | undefined) ||
            (prev.references as string[] | undefined) ||
            [];

          incoming.forEach((ref) => {
            if (ref) {
              references.add(ref);
            }
          });

          nextData.references = Array.from(references);
        }

        return nextData;
      });
    },
    [imageToVideoTarget],
  );

  const handleImageToVideoSubmit = useCallback(
    async (data: PromptTextareaSchema & { isValid: boolean }) => {
      if (!imageToVideoTarget) {
        return;
      }

      if (!data.text?.trim()) {
        return notificationsService.error(
          'A prompt is required to generate a video',
        );
      }

      const modelKeys = (
        data.models?.length ? data.models : [videoModels[0]?.key]
      ).filter((modelKey): modelKey is string => Boolean(modelKey));

      if (modelKeys.length === 0) {
        return notificationsService.error(
          'No video models available for conversion',
        );
      }

      setIsImageToVideoGenerating(true);

      try {
        const service = await getVideosService();

        const references = Array.from(
          new Set<string>([
            imageToVideoTarget.id,
            ...((data.references as string[] | undefined) || []),
          ]),
        );

        const fallbackFormat = isIngredientFormat(
          imageToVideoTarget.ingredientFormat,
        )
          ? imageToVideoTarget.ingredientFormat
          : IngredientFormat.PORTRAIT;
        const fallbackDimensions: Record<
          IngredientFormat,
          { width: number; height: number }
        > = {
          [IngredientFormat.LANDSCAPE]: { height: 1080, width: 1920 },
          [IngredientFormat.SQUARE]: { height: 1024, width: 1024 },
          [IngredientFormat.PORTRAIT]: { height: 1920, width: 1080 },
        };
        const format: IngredientFormat = isIngredientFormat(data.format)
          ? data.format
          : fallbackFormat;
        const defaults = fallbackDimensions[format];
        const blacklist = (data.blacklist ?? [])
          .map((item) => item.trim())
          .filter((value): value is string => value.length > 0);
        const tagKeys = (data.tags ?? [])
          .map((item) => item.trim())
          .filter((value): value is string => value.length > 0);
        const resolvedTags = tagKeys
          .map((key) =>
            availableTags.find(
              (tag) => tag.key === key || tag.id === key || tag.label === key,
            ),
          )
          .filter((tag): tag is ITag => Boolean(tag));

        for (const modelKey of modelKeys) {
          const payload: ImageToVideoGenerationPayload = {
            blacklist,
            camera: data.camera?.trim() || undefined,
            duration: data.duration || undefined,
            fontFamily: data.fontFamily?.trim() || undefined,
            format,
            height:
              data.height ||
              imageToVideoTarget.metadataHeight ||
              defaults.height,
            model: modelKey,
            mood: data.mood?.trim() || undefined,
            outputs: data.outputs || 1,
            parent: imageToVideoTarget.id,
            references,
            resolution: data.resolution?.trim() || undefined,
            sounds: data.sounds || [],
            speech: data.speech?.trim() || undefined,
            style: data.style?.trim() || undefined,
            tags: resolvedTags,
            text: data.text?.trim(),
            type: 'image-to-video',
            width:
              data.width || imageToVideoTarget.metadataWidth || defaults.width,
          };

          await service.post(payload);
        }

        setImageToVideoTarget(null);
        setImageToVideoPromptData({ isValid: false, text: '' });

        notificationsService.success('Video generation started');
        await findAllIngredientsByCategory(true);
      } catch (error: unknown) {
        logger.error('Failed to generate video from image', error);
        const errorMessage =
          error instanceof Error && error.message
            ? error.message
            : 'Failed to generate video from image';
        notificationsService.error(errorMessage);
      } finally {
        setIsImageToVideoGenerating(false);
      }
    },
    [
      availableTags,
      imageToVideoTarget,
      notificationsService,
      videoModels,
      getVideosService,
      findAllIngredientsByCategory,
    ],
  );

  const handleCloseImageToVideoModal = useCallback(() => {
    setImageToVideoTarget(null);
    setImageToVideoPromptData({ isValid: false, text: '' });
    setIsImageToVideoGenerating(false);
  }, []);

  return {
    availableTags,
    blacklists,
    cameras,
    fontFamilies,
    handleCloseImageToVideoModal,
    handleConvertToVideo,
    handleImageToVideoPromptChange,
    handleImageToVideoSubmit,
    imageToVideoPromptData,
    imageToVideoTarget,
    isImageToVideoGenerating,
    moods,
    presets,
    sounds,
    styles,
    videoModels,
  };
}
