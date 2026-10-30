import {
  isFlux3AspectRatio,
  isFlux3ImageModel,
  isFlux3Resolution,
} from '@genfeedai/contracts/constants';
import type { StudioPlaygroundSettings } from '@/features/studio/playground/types';

/**
 * The settings a model that Auto was priced at is submitted with. Auto keeps
 * whatever the previous choice left, so a FLUX model needs the same fixed
 * controls an explicit FLUX pick sets (one output, a native resolution and
 * aspect ratio). Every other model is submitted with the settings as they are.
 */
export function pinStudioSettingsToModel(
  settings: StudioPlaygroundSettings,
  modelKey: string,
): StudioPlaygroundSettings {
  const pinned = { ...settings, modelKey };
  if (!isFlux3ImageModel(modelKey)) return pinned;
  return {
    ...pinned,
    aspectRatio: isFlux3AspectRatio(settings.aspectRatio)
      ? settings.aspectRatio
      : 'auto',
    outputs: 1,
    resolution: isFlux3Resolution(settings.resolution)
      ? settings.resolution
      : '1k',
  };
}
