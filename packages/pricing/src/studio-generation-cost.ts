import {
  ModelCategory,
  ModelLifecycle,
  ModelProvider,
  PricingType,
  RouterPriority,
} from '@genfeedai/contracts';
import {
  isImageEditModel,
  MODEL_KEYS,
  MODEL_OUTPUT_CAPABILITIES,
} from '@genfeedai/contracts/constants';
import type {
  StudioGenerateSettings,
  StudioGenerationCostEstimate,
  StudioGenerationCostInput,
} from '@genfeedai/contracts/interfaces/studio/studio-generate.interface';
import { isImageQualitySupported } from '@genfeedai/helpers/media/image-quality/image-quality.helper';
import {
  getDefaultVideoResolution,
  getVideoResolutionsByModel,
} from '@genfeedai/helpers/media/video-resolution/video-resolution.helper';
import {
  calculateImageGenerationCredits,
  calculateVideoGenerationCredits,
} from './generation-credit-calculator';

const UNAVAILABLE: StudioGenerationCostEstimate = {
  credits: null,
  status: 'unavailable',
};

/** Same long-edge table Studio uses when it turns a resolution label into pixels. */
const RESOLUTION_LONG_EDGE: Record<string, number> = {
  '360p': 640,
  '1080P': 1920,
  '1080p': 1920,
  '1K': 1024,
  '2K': 2048,
  '480P': 854,
  '480p': 854,
  '720p': 1280,
  '768P': 1366,
  '768p': 1366,
  '4k': 3840,
  high: 1920,
  pro: 1920,
  standard: 1280,
};

const DEFAULT_LONG_EDGE = 1024;
const EDGE_MULTIPLE = 8;
const DEFAULT_VIDEO_DURATION = 5;
const AUTO_MODEL_KEY = '__auto_model__';

const DEFAULT_ASPECT_RATIO = {
  image: '1:1',
  'image-edit': '1:1',
  video: '16:9',
} as const;

const DEFAULT_RESOLUTION = {
  image: '1K',
  'image-edit': '1K',
  video: '720p',
} as const;

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Matches `isAutoGenerationModelKey` without pulling the UI selector into this module. */
function isAutoStudioModelKey(modelKey: string | undefined): boolean {
  return (
    modelKey == null ||
    modelKey === '' ||
    modelKey === AUTO_MODEL_KEY ||
    modelKey === 'auto'
  );
}

function snapToMultiple(value: number): number {
  return Math.max(
    EDGE_MULTIPLE,
    Math.round(value / EDGE_MULTIPLE) * EDGE_MULTIPLE,
  );
}

function parseAspectRatio(
  aspectRatio: string,
): { horizontal: number; vertical: number } | null {
  const [rawHorizontal, rawVertical] = aspectRatio.split(':');
  const horizontal = Number(rawHorizontal);
  const vertical = Number(rawVertical);

  if (
    !Number.isFinite(horizontal) ||
    !Number.isFinite(vertical) ||
    horizontal <= 0 ||
    vertical <= 0
  ) {
    return null;
  }

  return { horizontal, vertical };
}

function resolveAspectDimensions(
  aspectRatio: string,
  longEdge: number = DEFAULT_LONG_EDGE,
): { height: number; width: number } {
  const parsed = parseAspectRatio(aspectRatio);

  if (!parsed) {
    return { height: longEdge, width: longEdge };
  }

  const { horizontal, vertical } = parsed;

  if (horizontal >= vertical) {
    return {
      height: snapToMultiple((longEdge * vertical) / horizontal),
      width: longEdge,
    };
  }

  return {
    height: longEdge,
    width: snapToMultiple((longEdge * horizontal) / vertical),
  };
}

function resolveLongEdge(resolution: string): number {
  return RESOLUTION_LONG_EDGE[resolution] ?? DEFAULT_LONG_EDGE;
}

function resolveSubmittedVideoResolution(
  modelKey: string,
  resolution: string,
): string | undefined {
  const options = getVideoResolutionsByModel(modelKey);
  if (options.some((option) => option.value === resolution)) return resolution;
  return getDefaultVideoResolution(modelKey);
}

/** Composer defaults for the fields that change the estimate. Omitted tool inputs use these. */
export function buildStudioGenerationCostSettings(
  type: 'image' | 'image-edit' | 'video',
  overrides: {
    aspectRatio?: string;
    duration?: number;
    modelKey?: string;
    outputs?: number;
    resolution?: string;
  } = {},
): StudioGenerateSettings {
  return {
    aspectRatio: overrides.aspectRatio ?? DEFAULT_ASPECT_RATIO[type],
    blacklist: [],
    brandingMode: 'brand',
    duration:
      type === 'video'
        ? (overrides.duration ?? DEFAULT_VIDEO_DURATION)
        : overrides.duration,
    isAudioEnabled: false,
    modelKey:
      overrides.modelKey && overrides.modelKey.length > 0
        ? overrides.modelKey
        : AUTO_MODEL_KEY,
    outputs: overrides.outputs ?? 1,
    prioritize: RouterPriority.BALANCED,
    resolution: overrides.resolution ?? DEFAULT_RESOLUTION[type],
    tags: [],
  };
}

/** Only catalog evidence and the shared submission/calculation paths may inform an estimate. */
export function resolveStudioGenerationCost({
  isLoadingModels,
  model,
  settings,
  type,
}: StudioGenerationCostInput): StudioGenerationCostEstimate {
  if (type !== 'image' && type !== 'image-edit' && type !== 'video')
    return UNAVAILABLE;
  if (isLoadingModels) return { credits: null, status: 'loading' };
  if (isAutoStudioModelKey(settings.modelKey))
    return { credits: null, status: 'auto' };
  if (
    !model ||
    model.key !== settings.modelKey ||
    !model.isActive ||
    model.lifecycle === ModelLifecycle.RETIRED ||
    model.category !==
      (type === 'image-edit'
        ? ModelCategory.IMAGE_EDIT
        : type === 'image'
          ? ModelCategory.IMAGE
          : ModelCategory.VIDEO) ||
    model.reviewStatus === 'pending' ||
    model.reviewStatus === 'rejected' ||
    model.providerSyncStatus === 'quarantined' ||
    model.providerSyncStatus === 'review_required' ||
    model.providerSyncStatus === 'failed' ||
    model.pendingProviderContractVersion ||
    !Number.isFinite(model.cost) ||
    model.cost < 0 ||
    (model.minCost != null &&
      (!Number.isFinite(model.minCost) || model.minCost < 0)) ||
    (model.costPerUnit != null &&
      (!Number.isFinite(model.costPerUnit) || model.costPerUnit < 0)) ||
    !Number.isInteger(settings.outputs) ||
    settings.outputs < 1
  )
    return UNAVAILABLE;

  // These are the two provider dispatch paths whose fan-out semantics are known here.
  // Special endpoints dispatch before the catalog provider; do not misprice them as Replicate.
  if (
    (model.provider !== ModelProvider.FAL &&
      model.provider !== ModelProvider.REPLICATE) ||
    model.key.toLowerCase().startsWith('genfeed-ai/') ||
    [
      MODEL_KEYS.KLINGAI_V2,
      MODEL_KEYS.HIGGSFIELD_SOUL,
      MODEL_KEYS.LEONARDOAI,
      MODEL_KEYS.SDXL,
    ].some((key) => key === model.key)
  )
    return UNAVAILABLE;

  const pricingType = model.pricingType ?? PricingType.FLAT;
  if (
    ![
      PricingType.FLAT,
      PricingType.PER_REQUEST,
      PricingType.PER_MEGAPIXEL,
      ...(type === 'video' ? [PricingType.PER_SECOND] : []),
    ].includes(pricingType)
  )
    return UNAVAILABLE;
  const isMetered =
    pricingType === PricingType.PER_MEGAPIXEL ||
    pricingType === PricingType.PER_SECOND;
  if (
    model.isFree === true &&
    model.cost === 0 &&
    (isMetered ? model.costPerUnit === 0 : (model.costPerUnit ?? 0) === 0) &&
    (model.minCost ?? 0) === 0
  ) {
    return { credits: 0, status: 'estimated' };
  }
  if (
    isMetered
      ? !isPositiveFinite(model.costPerUnit)
      : !isPositiveFinite(model.cost)
  )
    return UNAVAILABLE;

  if (type === 'image-edit') {
    if (
      !isImageEditModel(model.key) ||
      settings.outputs > 8 ||
      pricingType !== PricingType.FLAT
    )
      return UNAVAILABLE;
    return {
      credits: calculateImageGenerationCredits({
        height: 1024,
        width: 1024,
        imageProvider: model.provider,
        isBatchSupported: true,
        modelKey: model.key,
        outputs: settings.outputs,
        pricing: model,
        quality: 'medium',
      }).credits,
      status: 'estimated',
    };
  }
  const size = resolveAspectDimensions(
    settings.aspectRatio,
    resolveLongEdge(settings.resolution),
  );
  // The charging services use the registry capability (false when absent), not the optional catalog flag.
  const isBatchSupported =
    MODEL_OUTPUT_CAPABILITIES[model.key]?.isBatchSupported ?? false;
  let credits: number;
  if (type === 'image') {
    credits = calculateImageGenerationCredits({
      ...size,
      imageProvider: model.provider,
      isBatchSupported,
      modelKey: model.key,
      outputs: settings.outputs,
      pricing: model,
      quality: isImageQualitySupported(model.key, settings.resolution)
        ? settings.resolution
        : undefined,
    }).credits;
  } else {
    // Video setup has no output multiplier; submission always prices one clip.
    const resolution = resolveSubmittedVideoResolution(
      model.key,
      settings.resolution,
    );
    const duration = isPositiveFinite(settings.duration)
      ? settings.duration
      : undefined;
    if ((pricingType === PricingType.PER_SECOND && !duration) || !resolution)
      return UNAVAILABLE;
    credits = calculateVideoGenerationCredits({
      ...size,
      duration,
      isBatchSupported,
      modelKey: model.key,
      outputs: 1,
      pricing: model,
      resolution,
    }).credits;
  }
  return isPositiveFinite(credits)
    ? { credits, status: 'estimated' }
    : UNAVAILABLE;
}
