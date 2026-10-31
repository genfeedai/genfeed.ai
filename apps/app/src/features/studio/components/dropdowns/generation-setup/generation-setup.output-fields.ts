import { resolveMusicSettings } from '@genfeedai/contracts/constants';
import { resolveModelDurationOptions } from '@genfeedai/helpers/generation-controls.helper';
import {
  GENERATION_SETUP_ASPECT_RATIO_OPTIONS,
  GENERATION_SETUP_DURATION_OPTIONS_SECONDS,
} from '@/features/studio/components/dropdowns/generation-setup/generation-setup.constants';
import type { GenerationSetupOutputFieldsInput } from '@/features/studio/props/generation-setup.props';

export const GENERATION_SETUP_AUTO_ASPECT_RATIO = 'auto';

/**
 * Which output fields apply to a setup, and the lists they offer. The Aspect
 * ratio and Duration chips, the Output menu and the chip row all read this, so
 * a chip never shows for a menu that would be empty.
 */
export function resolveGenerationSetupOutputFields({
  capabilities,
  controls,
  inputControls,
  models = [],
  referenceCount = 0,
  setup,
}: GenerationSetupOutputFieldsInput) {
  const isMusic = setup.values.type === 'music';
  const musicDurationState = isMusic
    ? resolveMusicSettings(setup.values.modelKey)
    : null;
  // A video model offers the clip lengths its provider runs at the chosen
  // resolution; the shared list only covers a model that declares none.
  const selectedModel = models.find(
    (model) => model.key === setup.values.modelKey,
  );
  const modelDurations =
    !isMusic && selectedModel
      ? resolveModelDurationOptions(selectedModel, setup.values.resolution)
      : [];
  const durationOptions = musicDurationState
    ? musicDurationState.durations
    : modelDurations.length > 0
      ? modelDurations
      : GENERATION_SETUP_DURATION_OPTIONS_SECONDS;
  const hasDurationEditing = musicDurationState
    ? musicDurationState.hasDurationEditing
    : true;
  const hasInstrumental = musicDurationState
    ? musicDurationState.hasInstrumentalToggle &&
      capabilities.hasInstrumentalToggle
    : capabilities.hasInstrumentalToggle;
  const hasLyrics = musicDurationState
    ? musicDurationState.hasLyrics && capabilities.hasLyrics
    : capabilities.hasLyrics;

  const modelRatios = inputControls?.fields.aspect_ratio?.enum?.filter(
    (value): value is string =>
      typeof value === 'string' &&
      (value !== GENERATION_SETUP_AUTO_ASPECT_RATIO ||
        referenceCount > 0 ||
        !inputControls.isAutoAspectReferenceRequired),
  );
  const ratios = modelRatios ?? GENERATION_SETUP_ASPECT_RATIO_OPTIONS;

  return {
    durationOptions,
    // Models without an `auto` value hand the choice back to the agent instead.
    hasAutoRatio: ratios.includes(GENERATION_SETUP_AUTO_ASPECT_RATIO),
    hasExtraFields:
      capabilities.hasStyle ||
      hasInstrumental ||
      hasLyrics ||
      Boolean(controls),
    hasInstrumental,
    hasLyrics,
    ratios: ratios.filter(
      (ratio) => ratio !== GENERATION_SETUP_AUTO_ASPECT_RATIO,
    ),
    showAspectRatio:
      capabilities.hasAspectRatio && inputControls?.mediaKind !== 'video',
    showDuration:
      inputControls?.mediaKind !== 'video' &&
      capabilities.hasDuration &&
      hasDurationEditing,
  };
}
