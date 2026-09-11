import type {
  IStudioLook,
  StudioLookAssetType,
} from '@genfeedai/contracts/interfaces';
import type { GenerationSetupValues } from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';

/**
 * Builds the full widened `StudioLookPayload`. `GenerationSetupValues` is a
 * strict superset of every field the Preset entity persists, so this reads
 * straight off the shared generation-setup store's values — no round-trip
 * through `StudioGenerateSettings`.
 */
export function buildStudioLookPayload(
  label: string,
  type: StudioLookAssetType,
  values: GenerationSetupValues,
) {
  const isVideo = type === 'video';

  return {
    aspectRatio: values.aspectRatio,
    assetType: type,
    brandingMode: values.brandingMode,
    camera: values.camera ?? '',
    cameraMovement: isVideo ? (values.cameraMovement ?? '') : null,
    duration: isVideo ? (values.duration ?? null) : null,
    label: label.trim(),
    lens: values.lens ?? '',
    lighting: values.lighting ?? '',
    modelKey: values.modelKey || null,
    mood: values.mood ?? '',
    outputs: values.outputs,
    prioritize: values.prioritize,
    promptTemplate: values.promptTemplate ?? '',
    resolution: values.resolution ?? null,
    scene: values.scene ?? '',
    style: values.style ?? '',
  };
}

/**
 * Projects a persisted Preset back onto the shared generation-setup store's
 * values, for `applyPreset`. Only fields the Preset actually carries are
 * included — everything else is left for the store to fill from the
 * scope's existing values/defaults.
 */
export function presetToGenerationSetupValues(
  preset: IStudioLook,
): Partial<GenerationSetupValues> {
  const isVideo = preset.assetType === 'video';
  const patch: Partial<GenerationSetupValues> = {
    camera: preset.camera || undefined,
    lens: preset.lens || undefined,
    lighting: preset.lighting || undefined,
    mood: preset.mood || undefined,
    promptTemplate: preset.promptTemplate || undefined,
    scene: preset.scene || undefined,
    style: preset.style || undefined,
  };

  if (isVideo && preset.cameraMovement) {
    patch.cameraMovement = preset.cameraMovement;
  }
  if (isVideo && preset.duration != null) {
    patch.duration = preset.duration;
  }
  if (preset.aspectRatio) {
    patch.aspectRatio = preset.aspectRatio;
  }
  if (preset.brandingMode) {
    patch.brandingMode = preset.brandingMode;
  }
  if (preset.modelKey) {
    patch.modelKey = preset.modelKey;
  }
  if (preset.outputs != null) {
    patch.outputs = preset.outputs;
  }
  if (preset.prioritize) {
    patch.prioritize = preset.prioritize;
  }
  if (preset.resolution) {
    patch.resolution = preset.resolution;
  }

  return patch;
}
