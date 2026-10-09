import {
  type ImageEditSize,
  isFlux3ImageModel,
} from '@genfeedai/contracts/constants';
import type { AgentGenerationQuoteRequest } from '@genfeedai/contracts/interfaces/ai/agent-generation-quote.interface';
import type { StudioPlaygroundType } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { isImageQualitySupported } from '@genfeedai/helpers/media/image-quality/image-quality.helper';
import {
  getDefaultVideoResolution,
  getVideoResolutionsByModel,
} from '@genfeedai/helpers/media/video-resolution/video-resolution.helper';

const AUTO_MODEL_KEY = '__auto_model__';

/** Matches `isAutoGenerationModelKey` without pulling the UI selector into this module. */
export function isAutoStudioModelKey(modelKey: string | undefined): boolean {
  return (
    modelKey == null ||
    modelKey === '' ||
    modelKey === AUTO_MODEL_KEY ||
    modelKey === 'auto'
  );
}

function resolveSubmittedVideoResolution(
  modelKey: string,
  resolution: string,
): string | undefined {
  const options = getVideoResolutionsByModel(modelKey);
  if (options.some((option) => option.value === resolution)) return resolution;
  return getDefaultVideoResolution(modelKey);
}

export interface StudioGenerationQuoteInput {
  aspectRatio?: string;
  duration?: number;
  editSize?: ImageEditSize;
  referenceUrls?: string[];
  height?: number;
  isAudioEnabled?: boolean;
  modelKey: string | undefined;
  outputs?: number;
  resolution?: string;
  type: StudioPlaygroundType;
  width?: number;
}

/**
 * The selectors Studio submits, shaped as a server quote request. This only
 * chooses which settings are sent; every credit amount comes from the server
 * quote that admission charges (`POST /router/estimate-generation-credits`).
 * Returns `null` when there is no concrete model to quote (Auto, or a type
 * the server does not price).
 */
export function buildStudioGenerationQuoteRequest({
  aspectRatio,
  duration,
  editSize,
  referenceUrls,
  height,
  isAudioEnabled,
  modelKey,
  outputs,
  resolution,
  type,
  width,
}: StudioGenerationQuoteInput): AgentGenerationQuoteRequest | null {
  if (type !== 'image' && type !== 'image-edit' && type !== 'video')
    return null;
  if (!modelKey || isAutoStudioModelKey(modelKey)) return null;

  const base = {
    ...(aspectRatio !== undefined ? { aspectRatio } : {}),
    category: type,
    modelKey,
    ...(referenceUrls?.length ? { referenceUrls } : {}),
    ...(type === 'image-edit' && editSize !== undefined ? { editSize } : {}),
    ...(width !== undefined && height !== undefined ? { height, width } : {}),
  };

  const outputSelector = outputs !== undefined ? { outputs } : {};
  if (type === 'video') {
    return {
      ...base,
      ...(duration !== undefined ? { duration } : {}),
      ...(isAudioEnabled !== undefined ? { isAudioEnabled } : {}),
      outputs: 1,
      resolution: resolveSubmittedVideoResolution(modelKey, resolution ?? ''),
    };
  }
  if (isFlux3ImageModel(modelKey)) {
    return {
      ...base,
      ...outputSelector,
      ...(resolution !== undefined ? { resolution } : {}),
    };
  }
  if (type === 'image-edit') {
    return { ...base, ...outputSelector };
  }
  return {
    ...base,
    ...outputSelector,
    ...(resolution !== undefined &&
    isImageQualitySupported(modelKey, resolution)
      ? { quality: resolution }
      : {}),
  };
}
