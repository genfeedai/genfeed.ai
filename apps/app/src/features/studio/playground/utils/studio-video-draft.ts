import { resolveVideoDraftModelKey } from '@genfeedai/contracts/constants';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { getVideoResolutionsByModel } from '@genfeedai/helpers/media/video-resolution/video-resolution.helper';
import type { StudioPlaygroundSettings } from '@/features/studio/playground/types';

/**
 * The settings a draft is submitted and priced with: the model's cheaper
 * sibling when it has one, its lowest resolution, its shortest length, no
 * audio and a single output. `null` when Studio cannot draft the choice (Auto,
 * a model not on offer, or settings already as cheap as a draft), so a draft
 * is never charged at the full price by falling back to the real settings.
 */
export function buildVideoDraftSettings(
  settings: StudioPlaygroundSettings,
  models: readonly IModel[],
): StudioPlaygroundSettings | null {
  if (!models.some((model) => model.key === settings.modelKey)) return null;

  const draftModelKey = resolveVideoDraftModelKey(settings.modelKey, (key) =>
    models.some((model) => model.key === key),
  );
  const draftModel = models.find((model) => model.key === draftModelKey);
  if (!draftModel) return null;

  const resolution =
    getVideoResolutionsByModel(draftModelKey)[0]?.value ?? settings.resolution;
  const durations =
    draftModel.durationsByResolution?.[resolution.toLowerCase()] ??
    draftModel.durations ??
    [];
  const draft: StudioPlaygroundSettings = {
    ...settings,
    isAudioEnabled: false,
    modelKey: draftModelKey,
    outputs: 1,
    resolution,
    ...(durations.length > 0 ? { duration: Math.min(...durations) } : {}),
  };

  const isCheaper =
    draft.modelKey !== settings.modelKey ||
    draft.resolution !== settings.resolution ||
    draft.duration !== settings.duration ||
    draft.isAudioEnabled !== settings.isAudioEnabled ||
    draft.outputs !== settings.outputs;
  return isCheaper ? draft : null;
}
