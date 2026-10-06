import {
  FLUX_3_ASPECT_RATIOS,
  isFlux3AspectRatio,
  isImageEditModel,
} from '@genfeedai/contracts/constants';
import type { StudioGenerateSettings } from '@pages/studio/generate/types';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';

/** Pixel rounding only. A nearer ladder entry is not the source ratio. */
const ASPECT_MATCH_TOLERANCE = 0.01;

export interface ImageEditEntrySource {
  editPrimaryId: string;
  sourceAspectRatio?: string;
  sourceModelKey?: string;
}

export interface ImageEditEntryResolution {
  /**
   * Set when the recorded ratio is not one the editor can select. The patch
   * then uses `auto` (match the source image) instead of the 1:1 default.
   */
  droppedAspectRatio: string | null;
  patch: Partial<StudioGenerateSettings>;
}

/**
 * Edit image attaches the source and opens the editor. A generation model
 * such as Hailuo is not an editor, so that case keeps the editor default.
 * A ratio the editor lists is copied through. Anything else matches the
 * source image rather than resetting to the type default.
 */
export function resolveImageEditEntry(
  source: ImageEditEntrySource,
): ImageEditEntryResolution {
  const patch: Partial<StudioGenerateSettings> = {
    editPrimaryId: source.editPrimaryId,
    editSeed: undefined,
    editSize: 'source',
  };
  const sourceModelKey = source.sourceModelKey?.trim();
  if (sourceModelKey) {
    patch.modelKey = isImageEditModel(sourceModelKey)
      ? sourceModelKey
      : AUTO_MODEL_OPTION_VALUE;
  }

  const sourceAspectRatio = source.sourceAspectRatio?.trim();
  if (!sourceAspectRatio) {
    return { droppedAspectRatio: null, patch };
  }
  if (isFlux3AspectRatio(sourceAspectRatio)) {
    patch.aspectRatio = sourceAspectRatio;
    return { droppedAspectRatio: null, patch };
  }

  patch.aspectRatio = 'auto';
  return { droppedAspectRatio: sourceAspectRatio, patch };
}

export function readImageEditSourceAspect(input: {
  height?: number;
  recipeAspectRatio?: string;
  recipeEditAspectRatio?: string;
  width?: number;
}): string | undefined {
  const recorded = input.recipeEditAspectRatio || input.recipeAspectRatio;
  if (recorded?.trim()) {
    return recorded;
  }
  if (
    input.width !== undefined &&
    input.height !== undefined &&
    input.width > 0 &&
    input.height > 0
  ) {
    return (
      selectableRatioForDimensions(input.width, input.height) ??
      `${input.width}×${input.height}`
    );
  }
  return undefined;
}

function ratioValue(aspectRatio: string): number | null {
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
  return horizontal / vertical;
}

function selectableRatioForDimensions(
  width: number,
  height: number,
): string | undefined {
  const target = width / height;
  let best: { distance: number; ratio: string } | undefined;
  for (const ratio of FLUX_3_ASPECT_RATIOS) {
    if (ratio === 'auto') {
      continue;
    }
    const value = ratioValue(ratio);
    if (value === null) {
      continue;
    }
    const distance = Math.abs(value - target);
    if (distance > ASPECT_MATCH_TOLERANCE) {
      continue;
    }
    if (!best || distance < best.distance) {
      best = { distance, ratio };
    }
  }
  return best?.ratio;
}

export function readImageEditSourceModel(input: {
  modelKey?: string;
  recipeEditModel?: string;
  recipeModelKey?: string;
}): string | undefined {
  return input.recipeEditModel || input.recipeModelKey || input.modelKey;
}
