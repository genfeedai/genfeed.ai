'use client';

import { IngredientFormat, RouterPriority } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import { isAspectRatioSupported } from '@helpers/aspect-ratio.helper';
import {
  filterModelsByAspectRatio,
  getAspectRatioForFormat,
} from '@helpers/generation-controls.helper';
import type { PromptBarModelControlsProps } from '@props/studio/prompt-bar.props';
import ModelSelectorPopover from '@ui/dropdowns/model-selector/ModelSelectorPopover';
import {
  AUTO_MODEL_OPTION_VALUE,
  getAutoModelLabel,
} from '@ui/dropdowns/model-selector/model-selector.constants';
import { useModelFavorites } from '@ui/dropdowns/model-selector/useModelFavorites';
import { memo } from 'react';
import { HiCpuChip } from 'react-icons/hi2';

const PromptBarModelControls = memo(function PromptBarModelControls({
  isAdvancedMode,
  hasModelButton,
  models,
  trainingIds,
  watchedFormat,
  watchedModels,
  modelDropdownRef,
  isModelNotSet,
  controlClass,
  form,
  getModelDefaultDuration,
  getDefaultVideoResolution,
  triggerConfigChange,
  currentModelCategory,
}: PromptBarModelControlsProps) {
  const { favoriteModelKeys, onFavoriteToggle } = useModelFavorites();

  if (!isAdvancedMode || !hasModelButton || models.length === 0) {
    return null;
  }

  const isAutoSelectModel = form.watch('autoSelectModel') === true;
  const selectedPrioritize =
    (form.watch('prioritize') as RouterPriority | undefined) ||
    RouterPriority.BALANCED;
  const autoLabel = getAutoModelLabel(selectedPrioritize);

  const visibleModels = filterModelsByAspectRatio(
    models as IModel[],
    getAspectRatioForFormat(watchedFormat),
    currentModelCategory ?? undefined,
  );

  if (visibleModels.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 h-10 px-3 text-sm text-foreground/50 bg-white/5 border border-white/10">
        <HiCpuChip className="w-4 h-4" />
        No models for this format
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <ModelSelectorPopover
        name="models"
        className={controlClass}
        values={isAutoSelectModel ? [AUTO_MODEL_OPTION_VALUE] : watchedModels}
        autoLabel={autoLabel}
        prioritize={selectedPrioritize}
        onPrioritizeChange={(prioritize) => {
          form.setValue('prioritize', prioritize, {
            shouldValidate: true,
          });
          triggerConfigChange();
        }}
        models={visibleModels}
        buttonRef={modelDropdownRef}
        shouldFlash={isModelNotSet && !isAutoSelectModel}
        favoriteModelKeys={favoriteModelKeys}
        onFavoriteToggle={onFavoriteToggle}
        sourceGroupResolver={(model) =>
          model.id && trainingIds.has(model.id) ? 'trainings' : 'models'
        }
        sourceGroupLabels={{
          models: 'Models',
          trainings: 'Trainings',
        }}
        autoSourceGroups={['models']}
        onChange={(_name: string, values: string[]) => {
          const hasAutoOption = values.includes(AUTO_MODEL_OPTION_VALUE);
          const manualValues = values.filter(
            (value) => value !== AUTO_MODEL_OPTION_VALUE,
          );

          if (hasAutoOption && manualValues.length === 0) {
            form.setValue('autoSelectModel', true, {
              shouldValidate: true,
            });
            form.setValue('models', [], {
              shouldDirty: false,
              shouldValidate: false,
            });
            triggerConfigChange();
            return;
          }

          form.setValue('autoSelectModel', false, {
            shouldValidate: true,
          });

          form.setValue('models', manualValues, {
            shouldDirty: false,
            shouldValidate: false,
          });

          const primaryModel = manualValues[0];
          if (primaryModel) {
            const defaultDuration = getModelDefaultDuration(
              primaryModel as string,
            );
            if (defaultDuration) {
              form.setValue('duration', defaultDuration, {
                shouldValidate: true,
              });
            }

            const defaultResolution = getDefaultVideoResolution(primaryModel);
            if (defaultResolution) {
              form.setValue('resolution', defaultResolution, {
                shouldValidate: true,
              });
            }

            const hasModelThatDoesntSupportSquare = manualValues.some(
              (modelKey: string) =>
                modelKey && !isAspectRatioSupported(modelKey, '1:1'),
            );

            if (
              hasModelThatDoesntSupportSquare &&
              form.getValues('format') === IngredientFormat.SQUARE
            ) {
              form.setValue('format', IngredientFormat.PORTRAIT, {
                shouldValidate: true,
              });
              form.setValue('width', 1080, { shouldValidate: true });
              form.setValue('height', 1920, { shouldValidate: true });
            }
          }
          triggerConfigChange();
        }}
      />
    </div>
  );
});

export default PromptBarModelControls;
