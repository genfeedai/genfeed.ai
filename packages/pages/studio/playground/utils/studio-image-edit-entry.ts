import {
  FLUX_3_ASPECT_RATIOS,
  isFlux3AspectRatio,
  isImageEditModel,
} from '@genfeedai/contracts/constants';
import type { ImageEditingRecipe } from '@genfeedai/contracts/interfaces';
import type { StudioPlaygroundSettings } from '@pages/studio/playground/types';
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
  /**
   * Set when the source model cannot edit. The patch then selects the editor
   * default instead of a generation model such as Nano Banana or Hailuo.
   */
  replacedModelKey: string | null;
  patch: Partial<StudioPlaygroundSettings>;
}

/**
 * Edit image attaches the source and opens the editor. A generation model
 * such as Hailuo is not an editor, so that case keeps the editor default
 * and says so. An editing model the user already selected is kept. A ratio
 * the editor lists is copied through. Anything else matches the source
 * image rather than resetting to the type default.
 */
export function resolveImageEditEntry(
  source: ImageEditEntrySource,
): ImageEditEntryResolution {
  const patch: Partial<StudioPlaygroundSettings> = {
    editPrimaryId: source.editPrimaryId,
    editSeed: undefined,
    editSize: 'source',
  };
  let replacedModelKey: string | null = null;
  const sourceModelKey = source.sourceModelKey?.trim();
  if (sourceModelKey) {
    if (isImageEditModel(sourceModelKey)) {
      patch.modelKey = sourceModelKey;
    } else {
      patch.modelKey = AUTO_MODEL_OPTION_VALUE;
      replacedModelKey = sourceModelKey;
    }
  }

  const sourceAspectRatio = source.sourceAspectRatio?.trim();
  if (!sourceAspectRatio) {
    return { droppedAspectRatio: null, patch, replacedModelKey };
  }
  if (isFlux3AspectRatio(sourceAspectRatio)) {
    patch.aspectRatio = sourceAspectRatio;
    return { droppedAspectRatio: null, patch, replacedModelKey };
  }

  patch.aspectRatio = 'auto';
  return {
    droppedAspectRatio: sourceAspectRatio,
    patch,
    replacedModelKey,
  };
}

/** `16:9` or `2.39:1`. CSS helpers such as `aspect-[16/9]` are not ratios. */
function ratioShaped(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed === 'auto') return trimmed;
  return /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(trimmed) ? trimmed : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

interface ImageEditMetadataRecord {
  height?: number;
  model?: string;
  width?: number;
}

function readMetadata(value: unknown): ImageEditMetadataRecord | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as ImageEditMetadataRecord;
  return {
    height: positive(record.height),
    model: text(record.model),
    width: positive(record.width),
  };
}

/**
 * Facts stored on the asset. `metadataWidth` / `metadataHeight` are not read:
 * the client model invents 1080×1920 when nothing was measured, and that
 * placeholder was landing the editor on the wrong ratio.
 */
export interface ImageEditAssetRecord {
  aspectRatio?: string;
  height?: number;
  id: string;
  imageEdit?: Pick<ImageEditingRecipe, 'aspectRatio' | 'model'>;
  metadata?: unknown;
  metadataModel?: string;
  model?: string;
  modelUsed?: string | null;
  width?: number;
}

export function imageEditEntryForAsset(
  asset: ImageEditAssetRecord,
  recorded?: {
    height?: number;
    modelKey?: string;
    recipeAspectRatio?: string;
    recipeModelKey?: string;
    width?: number;
  },
): ImageEditEntryResolution {
  const metadata = readMetadata(asset.metadata);
  return resolveImageEditEntry({
    editPrimaryId: asset.id,
    sourceAspectRatio: readImageEditSourceAspect({
      height: metadata?.height ?? positive(asset.height) ?? recorded?.height,
      recipeAspectRatio: recorded?.recipeAspectRatio,
      recipeEditAspectRatio: asset.imageEdit?.aspectRatio,
      recordedAspectRatio: asset.aspectRatio,
      width: metadata?.width ?? positive(asset.width) ?? recorded?.width,
    }),
    sourceModelKey: readImageEditSourceModel({
      modelKey:
        recorded?.modelKey ||
        metadata?.model ||
        asset.metadataModel ||
        asset.model,
      modelUsed: asset.modelUsed ?? undefined,
      recipeEditModel: asset.imageEdit?.model,
      recipeModelKey: recorded?.recipeModelKey,
    }),
  });
}

export function readImageEditSourceAspect(input: {
  height?: number;
  recipeAspectRatio?: string;
  recipeEditAspectRatio?: string;
  recordedAspectRatio?: string;
  width?: number;
}): string | undefined {
  const recorded =
    input.recipeEditAspectRatio?.trim() ||
    input.recipeAspectRatio?.trim() ||
    ratioShaped(input.recordedAspectRatio);
  if (recorded) {
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
  modelUsed?: string;
  recipeEditModel?: string;
  recipeModelKey?: string;
}): string | undefined {
  return (
    text(input.recipeEditModel) ||
    text(input.modelUsed) ||
    text(input.recipeModelKey) ||
    text(input.modelKey)
  );
}
