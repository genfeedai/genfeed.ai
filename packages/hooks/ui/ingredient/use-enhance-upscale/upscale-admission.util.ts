import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { IIngredient, IModel } from '@genfeedai/contracts/interfaces';
import type { IngredientActionAvailability } from '@genfeedai/props/content/masonry.props';
import {
  isImageIngredient,
  isVideoIngredient,
} from '@genfeedai/utils/media/ingredient-type.util';
import type {
  UpscaleConfirmData,
  VideoUpscaleModelOption,
} from '@hooks/ui/ingredient/use-enhance-upscale/use-enhance-upscale';

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

export function isKnownTransformCost(cost: unknown): cost is number {
  return typeof cost === 'number' && Number.isFinite(cost) && cost >= 0;
}

export function getUpscaleAdmission(
  ingredient: IIngredient,
  imageEditModels: readonly IModel[],
  videoEditModels: readonly IModel[],
): {
  availability: IngredientActionAvailability;
  confirmation?: Omit<UpscaleConfirmData, 'ingredient'>;
} {
  const isVideo = isVideoIngredient(ingredient);
  if (!isVideo && !isImageIngredient(ingredient))
    return {
      availability: { isAvailable: false, reason: 'sourceUnavailable' },
    };
  const models = isVideo ? videoEditModels : imageEditModels;
  const topaz = models.find(
    (model) =>
      model.key ===
      (isVideo
        ? MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE
        : MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE),
  );
  const selected = isVideo
    ? (topaz ??
      models.find((model) => VIDEO_UPSCALE_MODEL_CAPABILITIES[model.key]))
    : topaz;
  if (!selected)
    return { availability: { isAvailable: false, reason: 'modelUnavailable' } };
  if (!isKnownTransformCost(selected.cost))
    return { availability: { isAvailable: false, reason: 'priceUnavailable' } };
  const videoModelOptions = isVideo
    ? models.flatMap((model) => {
        const capabilities = VIDEO_UPSCALE_MODEL_CAPABILITIES[model.key];
        return capabilities && isKnownTransformCost(model.cost)
          ? [
              {
                ...capabilities,
                cost: model.cost,
                key: model.key,
                label: model.label,
              },
            ]
          : [];
      })
    : undefined;
  return {
    availability: { isAvailable: true },
    confirmation: {
      cost: selected.cost,
      modelKey: selected.key,
      ...(videoModelOptions ? { videoModelOptions } : {}),
    },
  };
}
