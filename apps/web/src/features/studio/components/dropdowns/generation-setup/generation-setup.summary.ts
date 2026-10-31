import { normalizeMusicSettings } from '@genfeedai/contracts/constants';
import {
  AUTO_PRIORITY_LABELS,
  isAutoGenerationModelKey,
} from '@ui/dropdowns/model-selector/model-selector.constants';
import type {
  GenerationSetupSummary,
  GenerationSetupSummaryInput,
} from '@/features/studio/props/generation-setup.props';

/**
 * What the setup menu and the Advanced chips show for a setup: the chosen
 * model (or, on Auto, the priority it routes by), the chosen clip length and
 * whether any Look field applies to this type.
 */
export function summarizeGenerationSetup({
  formatDuration,
  inputControls,
  lookOptions,
  models,
  setup,
}: GenerationSetupSummaryInput): GenerationSetupSummary {
  const isAutoModel = isAutoGenerationModelKey(setup.values.modelKey);
  const selectedModel = isAutoModel
    ? undefined
    : models.find((model) => model.key === setup.values.modelKey);
  const duration =
    setup.values.type === 'music'
      ? normalizeMusicSettings(setup.values.modelKey, setup.values).duration
      : setup.values.duration;

  return {
    durationLabel: duration ? formatDuration(duration) : '',
    hasLookFields: Object.entries(lookOptions).some(
      ([key, options]) =>
        (options?.length ?? 0) > 0 &&
        !(key === 'resolution' && inputControls?.mediaKind === 'video'),
    ),
    // Auto is the router's pick, so the chip names the priority it routes by.
    modelLabel: isAutoModel
      ? AUTO_PRIORITY_LABELS[setup.values.prioritize]
      : (selectedModel?.label ?? setup.values.modelKey),
    selectedModel,
  };
}
