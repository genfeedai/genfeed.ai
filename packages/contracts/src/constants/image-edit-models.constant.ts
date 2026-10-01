import {
  FLUX_3_EDIT_CONTRACT_VERSION,
  isFlux3AspectRatio,
  isFlux3Resolution,
} from './flux-3-image.constant';
import { MODEL_KEYS } from './model-keys.constant';

/** Verified Replicate Ideogram 4.5 editing contract, 2026-10-01. */
export const IMAGE_EDIT_MODEL_KEYS: readonly string[] = [
  MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5,
  MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE_EDIT,
];
export const IMAGE_EDIT_SIZES = [
  'source',
  '1024x1024',
  '1280x896',
  '896x1280',
  '1344x768',
  '768x1344',
  '1536x640',
  '640x1536',
] as const;
export type ImageEditSize = (typeof IMAGE_EDIT_SIZES)[number];
export const IMAGE_EDIT_MAX_SOURCES = 5;
export const IMAGE_EDIT_MAX_OUTPUTS = 8;
export const IMAGE_EDIT_QUALITY = 'medium';
export const IMAGE_EDIT_CONTRACT_VERSION = 'ideogram-4-5-edit-2026-10-01';

export function isImageEditModel(key: string): boolean {
  return IMAGE_EDIT_MODEL_KEYS.includes(key);
}

export function isImageEditSize(value: unknown): value is ImageEditSize {
  return (
    typeof value === 'string' && IMAGE_EDIT_SIZES.some((size) => size === value)
  );
}

/** Public recipe allowlist; provider metadata itself must never cross the API boundary. */
export function readImageEditingRecipe(
  value: unknown,
):
  | import('../interfaces/studio/image-editing.interface').ImageEditingRecipe
  | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const row = value as Record<string, unknown>;
  if (row.model === MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE_EDIT) {
    if (
      row.operation !== 'image-edit' ||
      row.contractVersion !== FLUX_3_EDIT_CONTRACT_VERSION ||
      !isFlux3Resolution(row.resolution) ||
      !isFlux3AspectRatio(row.aspectRatio) ||
      row.grounding !== false ||
      row.outputs !== 1 ||
      row.maskId !== undefined ||
      row.seed !== undefined ||
      row.size !== undefined ||
      row.quality !== undefined ||
      !Array.isArray(row.sourceIds) ||
      row.sourceIds.length < 1 ||
      row.sourceIds.length > 10 ||
      row.sourceIds.some((id) => typeof id !== 'string' || !id) ||
      new Set(row.sourceIds).size !== row.sourceIds.length
    )
      return undefined;
    return {
      operation: 'image-edit',
      contractVersion: FLUX_3_EDIT_CONTRACT_VERSION,
      model: row.model,
      sourceIds: row.sourceIds as string[],
      resolution: row.resolution,
      aspectRatio: row.aspectRatio,
      grounding: false,
      outputs: 1,
    };
  }
  if (
    row.operation !== 'image-edit' ||
    row.contractVersion !== IMAGE_EDIT_CONTRACT_VERSION ||
    typeof row.model !== 'string' ||
    !isImageEditModel(row.model) ||
    !isImageEditSize(row.size) ||
    row.quality !== IMAGE_EDIT_QUALITY ||
    !Array.isArray(row.sourceIds) ||
    row.sourceIds.length < 1 ||
    row.sourceIds.length > IMAGE_EDIT_MAX_SOURCES ||
    row.sourceIds.some((id) => typeof id !== 'string' || !id) ||
    new Set(row.sourceIds).size !== row.sourceIds.length ||
    typeof row.outputs !== 'number' ||
    !Number.isInteger(row.outputs) ||
    row.outputs < 1 ||
    row.outputs > IMAGE_EDIT_MAX_OUTPUTS ||
    (row.maskId !== undefined &&
      (typeof row.maskId !== 'string' || !row.maskId)) ||
    (row.seed !== undefined &&
      (typeof row.seed !== 'number' ||
        !Number.isInteger(row.seed) ||
        row.seed < 0 ||
        row.seed > 2147483647))
  )
    return undefined;
  return {
    operation: 'image-edit',
    contractVersion: IMAGE_EDIT_CONTRACT_VERSION,
    model: row.model,
    sourceIds: row.sourceIds as string[],
    size: row.size,
    quality: IMAGE_EDIT_QUALITY,
    outputs: row.outputs,
    ...(typeof row.maskId === 'string' ? { maskId: row.maskId } : {}),
    ...(typeof row.seed === 'number' ? { seed: row.seed } : {}),
  };
}
