import { IngredientCategory } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { IImageEditParams } from '@genfeedai/contracts/interfaces/components/image-edit.interface';
import type { IVideoEditParams } from '@genfeedai/contracts/interfaces/components/video-operations.interface';
import type { MasonryActionStates } from '@genfeedai/contracts/interfaces/hooks/hooks.interface';
import {
  isTopazVideoUpscaleFps,
  isTopazVideoUpscaleResolution,
  quoteTopazVideoUpscaleCredits,
} from '@genfeedai/pricing';
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
  getUpscaleAdmission,
  isKnownTransformCost,
} from '@hooks/ui/ingredient/use-enhance-upscale/upscale-admission.util';
import {
  executeSilentWithActionState,
  executeWithActionState,
} from '@hooks/utils/service-operation/service-operation.util';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

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

export interface UseEnhanceUpscaleParams {
  scopeKey?: string;
  onRefresh?: () => void | Promise<void>;
  autoConfirm?: boolean; // not used here (parent typically opens confirm), kept for parity
  getVideosService: () => Promise<VideosService>;
  getImagesService: () => Promise<ImagesService>;
  setActionStates: Dispatch<SetStateAction<MasonryActionStates>>;
}

export function useEnhanceUpscale({
  scopeKey,
  onRefresh,
  getVideosService,
  getImagesService,
  setActionStates,
}: UseEnhanceUpscaleParams) {
  const notificationsService = NotificationsService.getInstance();

  // Get models for cost lookup
  const { imageUpscaleModels, videoUpscaleModels } = useElements();
  const pendingTransformation = useRef(false);
  const pendingUpscaleSource = useRef<{ id: string; epoch: number } | null>(
    null,
  );
  const isMounted = useRef(true);
  const activeUpscaleConfirmation = useRef<UpscaleConfirmData | null>(null);
  const currentModels = useRef({ imageUpscaleModels, videoUpscaleModels });
  currentModels.current = { imageUpscaleModels, videoUpscaleModels };
  const owner = useRef({ scopeKey, epoch: 0 });
  if (owner.current.scopeKey !== scopeKey)
    owner.current = { scopeKey, epoch: owner.current.epoch + 1 };
  const upscaleOwner = useRef(0);
  // Re-render when the upscale source ref changes: the ref alone does not.
  const [, setPendingSourceVersion] = useState(0);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      activeUpscaleConfirmation.current = null;
    };
  }, []);

  // Only video upscale still asks: its model, resolution and frame rate are
  // chosen in the dialog. Images and enhance start straight away.
  const [upscaleConfirmData, setUpscaleConfirmData] =
    useState<UpscaleConfirmData | null>(null);

  const lastCommittedScope = useRef(scopeKey);
  useEffect(() => {
    if (lastCommittedScope.current === scopeKey) return;
    lastCommittedScope.current = scopeKey;
    activeUpscaleConfirmation.current = null;
    setUpscaleConfirmData(null);
  }, [scopeKey]);

  const getUpscaleAvailability = useCallback(
    (ingredient: IIngredient) => {
      if (pendingTransformation.current)
        return { isAvailable: false, reason: 'pending' as const };
      return getUpscaleAdmission(
        ingredient,
        imageUpscaleModels,
        videoUpscaleModels,
      ).availability;
    },
    [imageUpscaleModels, videoUpscaleModels],
  );

  const performUpscale = useCallback(
    async (
      confirmation: UpscaleConfirmData,
      confirmedEpoch: number,
      selection?: VideoUpscaleSelection,
    ) => {
      if (!confirmation.ingredient || pendingTransformation.current) {
        return;
      }

      const ingredient = confirmation.ingredient;
      const isVideo = isVideoIngredient(ingredient);
      const isImage = isImageIngredient(ingredient);

      if (!isVideo && !isImage) {
        return notificationsService.error(
          'Cannot upscale this ingredient type',
        );
      }

      const modelKey = isVideo
        ? (selection?.model ?? confirmation.modelKey)
        : confirmation.modelKey;
      const option = confirmation.videoModelOptions?.find(
        (candidate) => candidate.key === modelKey,
      );
      const quotedCost = isVideo ? option?.cost : confirmation.cost;
      const targetFps = selection?.targetFps ?? 30;
      const targetResolution = selection?.targetResolution ?? '1080p';
      const selectedCost = selection?.cost;
      const expectedCost =
        modelKey === MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE &&
        isKnownTransformCost(quotedCost) &&
        isTopazVideoUpscaleResolution(targetResolution) &&
        isTopazVideoUpscaleFps(targetFps)
          ? quoteTopazVideoUpscaleCredits(
              quotedCost,
              targetResolution,
              targetFps,
            )
          : quotedCost;
      const isStillConfirmed = () => {
        const models = isVideo
          ? currentModels.current.videoUpscaleModels
          : currentModels.current.imageUpscaleModels;
        const current = models.find((model) => model.key === modelKey);
        return Boolean(
          isMounted.current &&
            owner.current.epoch === confirmedEpoch &&
            current &&
            isKnownTransformCost(quotedCost) &&
            isKnownTransformCost(current.cost) &&
            current.cost === quotedCost,
        );
      };
      if (
        !isStillConfirmed() ||
        (isVideo &&
          (!option?.fps.includes(targetFps) ||
            !option?.resolutions.includes(targetResolution) ||
            (selection &&
              (!isKnownTransformCost(selectedCost) ||
                selectedCost !== expectedCost))))
      ) {
        return notificationsService.error(
          'Upscale model or price changed. Review a new quote before continuing.',
        );
      }
      pendingTransformation.current = true;
      pendingUpscaleSource.current = {
        id: ingredient.id,
        epoch: confirmedEpoch,
      };
      setPendingSourceVersion((version) => version + 1);
      activeUpscaleConfirmation.current = null;
      setUpscaleConfirmData(null);
      try {
        await executeSilentWithActionState({
          errorMessage: 'Failed to upscale ingredient',
          onSuccess: async () => {
            if (isMounted.current && owner.current.epoch === confirmedEpoch)
              await onRefresh?.();
          },
          operation: async () => {
            if (isVideo) {
              const service = await getVideosService();
              if (!isStillConfirmed())
                throw new Error('Upscale model or price changed');
              return service.postUpscale(ingredient.id, {
                model: modelKey,
                targetFps,
                targetResolution,
              });
            } else {
              const service = await getImagesService();
              if (!isStillConfirmed())
                throw new Error('Upscale model or price changed');
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
      } finally {
        pendingTransformation.current = false;
        pendingUpscaleSource.current = null;
        if (isMounted.current)
          setPendingSourceVersion((version) => version + 1);
      }
    },
    [
      getVideosService,
      getImagesService,
      notificationsService,
      onRefresh,
      setActionStates,
    ],
  );

  const handleUpscale = useCallback(
    async (ingredient: IIngredient) => {
      if (
        !isMounted.current ||
        pendingTransformation.current ||
        owner.current.scopeKey !== scopeKey
      )
        return;
      activeUpscaleConfirmation.current = null;
      setUpscaleConfirmData(null);
      const isVideo = isVideoIngredient(ingredient);
      const isImage = isImageIngredient(ingredient);

      if (!isVideo && !isImage) {
        return notificationsService.error(
          'Cannot upscale this ingredient type',
        );
      }

      const admission = getUpscaleAdmission(
        ingredient,
        imageUpscaleModels,
        videoUpscaleModels,
      );
      if (!admission.confirmation) {
        return notificationsService.error(
          admission.availability.reason === 'priceUnavailable'
            ? 'Upscale price unavailable. Refresh models before continuing.'
            : 'Upscale model not available',
        );
      }
      const confirmation: UpscaleConfirmData = {
        ...admission.confirmation,
        ingredient: { ...ingredient },
      };
      upscaleOwner.current = owner.current.epoch;
      if (isImage) {
        // Nothing to choose for an image: say what it costs and start.
        notificationsService.info(
          `Upscaling image with Topaz AI for ${formatNumberWithCommas(confirmation.cost)} credits.`,
        );
        await performUpscale(confirmation, owner.current.epoch);
        return;
      }
      activeUpscaleConfirmation.current = confirmation;
      setUpscaleConfirmData(confirmation);
    },
    [
      videoUpscaleModels,
      imageUpscaleModels,
      notificationsService,
      performUpscale,
      scopeKey,
    ],
  );

  const executeUpscale = useCallback(
    async (selection?: VideoUpscaleSelection) => {
      if (
        !upscaleConfirmData?.ingredient ||
        activeUpscaleConfirmation.current !== upscaleConfirmData
      ) {
        return;
      }
      await performUpscale(upscaleConfirmData, upscaleOwner.current, selection);
    },
    [performUpscale, upscaleConfirmData],
  );

  const clearUpscaleConfirm = useCallback(() => {
    activeUpscaleConfirmation.current = null;
    setUpscaleConfirmData(null);
  }, []);

  const performEnhance = useCallback(
    async (confirmation: UpscaleConfirmData, confirmedEpoch: number) => {
      if (!confirmation.ingredient || pendingTransformation.current) {
        return;
      }

      const ingredient = confirmation.ingredient;
      const isVideo = isVideoIngredient(ingredient);
      const modelKey = confirmation.modelKey;

      const isStillConfirmed = () => {
        const models = isVideo
          ? currentModels.current.videoUpscaleModels
          : currentModels.current.imageUpscaleModels;
        const current = models.find((model) => model.key === modelKey);
        return Boolean(
          isMounted.current &&
            owner.current.epoch === confirmedEpoch &&
            current &&
            isKnownTransformCost(current.cost) &&
            current.cost === confirmation.cost,
        );
      };
      if (!isStillConfirmed())
        return notificationsService.error(
          'Enhance model or price changed. Review a new quote before continuing.',
        );
      pendingTransformation.current = true;
      try {
        await executeWithActionState({
          errorMessage: 'Failed to enhance ingredient',
          onSuccess: async () => {
            if (isMounted.current && owner.current.epoch === confirmedEpoch)
              await onRefresh?.();
          },
          operation: async () => {
            if (isVideo) {
              const service = await getVideosService();
              if (!isStillConfirmed())
                throw new Error('Enhance model or price changed');
              const payload: TopazVideoEnhancePayload = {
                category: IngredientCategory.VIDEO,
                model: modelKey,
                parent: ingredient.id,
                prompt: TOPAZ_ENHANCE_PROMPT,
              };

              return service.postUpscale(ingredient.id, payload);
            }

            const service = await getImagesService();
            if (!isStillConfirmed())
              throw new Error('Enhance model or price changed');
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
      } finally {
        pendingTransformation.current = false;
      }
    },
    [
      notificationsService,
      getVideosService,
      getImagesService,
      onRefresh,
      setActionStates,
    ],
  );

  const handleEnhance = useCallback(
    async (ingredient: IIngredient) => {
      if (
        !isMounted.current ||
        pendingTransformation.current ||
        owner.current.scopeKey !== scopeKey
      )
        return;
      activeUpscaleConfirmation.current = null;
      setUpscaleConfirmData(null);
      const isVideo = isVideoIngredient(ingredient);
      const isImage = isImageIngredient(ingredient);

      if (!isVideo && !isImage) {
        return notificationsService.error('Can only enhance images and videos');
      }

      const models = isVideo ? videoUpscaleModels : imageUpscaleModels;
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

      if (!isKnownTransformCost(topazModel.cost)) {
        return notificationsService.error(
          'Enhance price unavailable. Refresh models before continuing.',
        );
      }
      const cost = topazModel.cost;

      const confirmation: UpscaleConfirmData = {
        cost,
        ingredient: { ...ingredient },
        modelKey: topazModel.key as string,
      };
      notificationsService.info(
        `Enhancing ${isVideo ? 'video' : 'image'} with Topaz AI for ${formatNumberWithCommas(cost)} credits.`,
      );
      await performEnhance(confirmation, owner.current.epoch);
    },
    [
      videoUpscaleModels,
      imageUpscaleModels,
      notificationsService,
      performEnhance,
      scopeKey,
    ],
  );

  const upscalingSourceId =
    pendingUpscaleSource.current?.epoch === owner.current.epoch
      ? pendingUpscaleSource.current.id
      : undefined;

  return {
    ...(upscalingSourceId ? { upscalingSourceId } : {}),
    getUpscaleAvailability,
    // Cancel helpers
    clearUpscaleConfirm,
    // Executors
    executeUpscale,
    handleEnhance,
    // Trigger
    handleUpscale,
    // Confirm data
    upscaleConfirmData:
      upscaleOwner.current === owner.current.epoch ? upscaleConfirmData : null,
  };
}
