import {
  FLUX_3_EDIT_CONTRACT_VERSION,
  IMAGE_EDIT_CONTRACT_VERSION,
  IMAGE_EDIT_QUALITY,
  isFlux3ImageModel,
  isMaiImageEditModel,
  MAI_IMAGE_EDIT_CONTRACT_VERSION,
} from '@genfeedai/contracts/constants';
import type { ImageEditingRecipe } from '@genfeedai/contracts/interfaces';
import type { StudioPlaygroundSettings } from '@/features/studio/playground/types';

interface StudioImageEditRequestInput {
  editMaskId: string | undefined;
  modelKey: string;
  settings: Pick<
    StudioPlaygroundSettings,
    'aspectRatio' | 'editSeed' | 'editSize' | 'outputs' | 'resolution'
  >;
  sourceIds: string[];
}

/** The recipe a Studio edit stores for the editing contract its model runs. */
export function buildStudioImageEditRecipe({
  editMaskId,
  modelKey,
  settings,
  sourceIds,
}: StudioImageEditRequestInput): ImageEditingRecipe {
  const base = { model: modelKey, operation: 'image-edit', sourceIds } as const;
  if (isMaiImageEditModel(modelKey))
    return {
      ...base,
      contractVersion: MAI_IMAGE_EDIT_CONTRACT_VERSION,
      outputs: 1,
    };
  if (isFlux3ImageModel(modelKey))
    return {
      ...base,
      aspectRatio: settings.aspectRatio,
      contractVersion: FLUX_3_EDIT_CONTRACT_VERSION,
      grounding: false,
      outputs: 1,
      resolution: settings.resolution,
    };
  return {
    ...base,
    contractVersion: IMAGE_EDIT_CONTRACT_VERSION,
    maskId: editMaskId,
    outputs: settings.outputs,
    quality: IMAGE_EDIT_QUALITY,
    seed: settings.editSeed,
    size: editMaskId ? 'source' : (settings.editSize ?? 'source'),
  };
}

/** The editing controls the model accepts; MAI-Image and FLUX.3 take one output and no mask, seed or size. */
export function buildStudioImageEditControls({
  editMaskId,
  modelKey,
  settings,
}: Omit<StudioImageEditRequestInput, 'sourceIds'>): Record<string, unknown> {
  if (isMaiImageEditModel(modelKey)) return { outputs: 1 };
  if (isFlux3ImageModel(modelKey))
    return {
      aspectRatio: settings.aspectRatio,
      outputs: 1,
      resolution: settings.resolution,
    };
  return {
    maskId: editMaskId,
    outputs: settings.outputs,
    seed: settings.editSeed,
    size: editMaskId ? 'source' : (settings.editSize ?? 'source'),
  };
}
