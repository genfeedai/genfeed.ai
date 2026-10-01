'use client';

import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  IngredientFormat,
  IngredientStatus,
  ModalEnum,
} from '@genfeedai/contracts';
import type {
  CrunVideoQuoteRequest,
  IIngredient,
  ImageToVideoGenerationPayload,
  ITag,
} from '@genfeedai/contracts/interfaces';
import { normalizeCrunVideoDraft } from '@genfeedai/helpers/crun-video-input.helper';
import { serializeCrunQuoteIntent } from '@genfeedai/hooks/prompt-bar/use-crun-generation-quote/use-crun-generation-quote';
import type { CrunVideoPromptBinding } from '@genfeedai/props/studio/prompt-bar.props';
import { logger } from '@genfeedai/services/core/logger.service';
import type { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { VideosService } from '@genfeedai/services/ingredients/videos.service';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useElements } from '@hooks/data/elements/use-elements/use-elements';
import { isIngredientFormat } from '@hooks/data/ingredients/use-ingredients-list/use-ingredients-filters';
import { useCallback, useMemo, useRef, useState } from 'react';

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
  const { brandId } = useBrand();
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

  const preparedCrunRequestRef = useRef<CrunVideoQuoteRequest | null>(null);
  const imageToVideoCrunBinding = useMemo<CrunVideoPromptBinding>(() => {
    preparedCrunRequestRef.current = null;
    return {
      prepareRequest(data): CrunVideoQuoteRequest | null {
        preparedCrunRequestRef.current = null;
        const model =
          data.models.length === 1
            ? videoModels.find((item) => item.key === data.models[0])
            : undefined;
        const controls = model?.inputControls;
        const sourceId = imageToVideoTarget?.id;
        const residual = data.crunControls;
        if (
          !sourceId ||
          !brandId ||
          model?.provider !== 'crun' ||
          model.key !== 'crun/kling/v2-5-turbo-pro' ||
          controls?.mediaKind !== 'video' ||
          !residual ||
          data.references?.length !== 1 ||
          data.references[0] !== sourceId ||
          data.videoReferences?.length ||
          !Number.isInteger(data.outputs ?? 1) ||
          (data.outputs ?? 1) < 1 ||
          (data.outputs ?? 1) > controls.maxOutputs
        )
          return null;
        const normalized = normalizeCrunVideoDraft(controls, {
          modelKey: residual.modelKey,
          contractVersion: residual.contractVersion,
          prompt: data.text,
          duration: data.duration,
          aspectRatio: residual.aspectRatio,
          resolution: data.resolution || undefined,
          negativePrompt: residual.negativePrompt,
          guidanceScale: residual.guidanceScale,
          translatePrompt: residual.translatePrompt,
          startFrameId: sourceId,
          endFrameId: data.endFrame || undefined,
        });
        if (!normalized.isValid) return null;
        const input = normalized.input;
        if (input.duration !== 5 && input.duration !== 10) return null;
        const request: CrunVideoQuoteRequest = {
          model: model.key,
          text: data.text.trim(),
          brandId,
          outputs: data.outputs ?? 1,
          references: [sourceId],
          parentId: sourceId,
          ...(data.endFrame ? { endFrame: data.endFrame } : {}),
          crunControls: {
            contractVersion: controls.version,
            duration: input.duration,
            ...(typeof input.aspect_ratio === 'string'
              ? { aspectRatio: input.aspect_ratio }
              : {}),
            ...(typeof input.negative_prompt === 'string'
              ? { negativePrompt: input.negative_prompt }
              : {}),
            ...(typeof input.cfg_scale === 'number'
              ? { guidanceScale: input.cfg_scale }
              : {}),
          },
          blacklist: data.blacklist,
          brandingMode:
            data.brandingMode ??
            (data.isBrandingEnabled === false ? 'off' : 'brand'),
          isBrandingEnabled:
            data.brandingMode === 'off'
              ? false
              : data.isBrandingEnabled !== false,
          ...(data.folder ? { folderId: data.folder } : {}),
          ...(data.prompt_template
            ? { promptTemplate: data.prompt_template, useTemplate: true }
            : {}),
          ...Object.fromEntries(
            [
              'camera',
              'style',
              'scene',
              'lighting',
              'mood',
              'lens',
              'fontFamily',
            ].flatMap((key) => {
              const value = data[key as keyof PromptTextareaSchema];
              return typeof value === 'string' && value.trim()
                ? [[key, value.trim()]]
                : [];
            }),
          ),
        };
        preparedCrunRequestRef.current = request;
        return request;
      },
      async submit(request) {
        if (
          !imageToVideoTarget ||
          request.parentId !== imageToVideoTarget.id ||
          request.references?.length !== 1 ||
          request.references[0] !== imageToVideoTarget.id ||
          request.brandId !== brandId ||
          request.model !== 'crun/kling/v2-5-turbo-pro'
        )
          throw new Error('Video conversion changed. Request a new quote.');
        setIsImageToVideoGenerating(true);
        try {
          const service = await getVideosService();
          const { crunQuoteId: _quoteId, ...intent } = request;
          if (
            serializeCrunQuoteIntent(preparedCrunRequestRef.current) !==
            serializeCrunQuoteIntent(intent)
          )
            throw new Error('Video conversion changed. Request a new quote.');
          await service.post(request);
          setImageToVideoTarget(null);
          setImageToVideoPromptData({ isValid: false, text: '' });
          notificationsService.success('Video generation started');
          await findAllIngredientsByCategory(true);
        } finally {
          setIsImageToVideoGenerating(false);
        }
      },
    };
  }, [
    brandId,
    imageToVideoTarget,
    videoModels,
    getVideosService,
    notificationsService,
    findAllIngredientsByCategory,
  ]);

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

      if (
        modelKeys.some(
          (key) =>
            key.startsWith('crun/') ||
            videoModels.find((model) => model.key === key)?.provider === 'crun',
        )
      ) {
        notificationsService.error(
          'Use the current video quote to start this conversion',
        );
        return;
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
    imageToVideoCrunBinding,
    imageToVideoTarget,
    isImageToVideoGenerating,
    moods,
    presets,
    sounds,
    styles,
    videoModels,
  };
}
