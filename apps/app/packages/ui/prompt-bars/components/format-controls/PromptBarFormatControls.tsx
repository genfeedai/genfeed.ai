'use client';

import { IngredientFormat } from '@genfeedai/enums';
import { isAspectRatioSupported } from '@helpers/aspect-ratio.helper';
import { formatVideos } from '@helpers/data/data/data.helper';
import {
  getAspectRatioForFormat,
  getFormatForAspectRatio,
} from '@helpers/generation-controls.helper';
import type { PromptBarFormatControlsProps } from '@props/studio/prompt-bar.props';
import AspectRatioDropdown from '@ui/dropdowns/aspect-ratio/AspectRatioDropdown';
import { memo } from 'react';

const PromptBarFormatControls = memo(function PromptBarFormatControls({
  currentConfig,
  form,
  formatIcon,
  normalizedWatchedModels,
  watchedModel,
  references,
  setReferences,
  setReferenceSource,
  triggerConfigChange,
  isDisabledState,
  controlClass,
}: PromptBarFormatControlsProps) {
  if (!currentConfig.buttons?.format) {
    return null;
  }

  const modelsToCheck =
    normalizedWatchedModels.length > 0
      ? normalizedWatchedModels
      : [watchedModel];

  const filteredRatios = formatVideos
    .filter((format) => {
      if (format.isDisabled) {
        return false;
      }

      const aspectRatio = getAspectRatioForFormat(format.id);
      if (!aspectRatio) {
        return true;
      }

      return modelsToCheck.some(
        (modelKey: string) =>
          modelKey && isAspectRatioSupported(modelKey, aspectRatio),
      );
    })
    .map((format) => getAspectRatioForFormat(format.id))
    .filter((ratio): ratio is string => ratio != null);

  const selectedFormatLabel =
    getAspectRatioForFormat(form.getValues('format') as IngredientFormat) ??
    'Format';

  function handleFormatChange(_name: string, value: string): void {
    const nextFormatId = getFormatForAspectRatio(value);
    if (!nextFormatId) {
      return;
    }

    const format = formatVideos.find((f) => f.id === nextFormatId);
    if (!format) {
      return;
    }

    const previousFormat = form.getValues('format');

    form.setValue('format', nextFormatId, {
      shouldDirty: false,
      shouldValidate: false,
    });

    form.setValue('width', format.width, {
      shouldDirty: false,
      shouldValidate: false,
    });

    form.setValue('height', format.height, {
      shouldDirty: false,
      shouldValidate: false,
    });

    if (previousFormat !== nextFormatId && references.length > 0) {
      setReferences([]);
      setReferenceSource('');
      form.setValue('references', [], { shouldValidate: true });
    }

    triggerConfigChange();
  }

  return (
    <div className="flex flex-col gap-2">
      <AspectRatioDropdown
        name="format"
        value={getAspectRatioForFormat(form.getValues('format')) ?? ''}
        ratios={filteredRatios}
        onChange={handleFormatChange}
        icon={formatIcon}
        className={controlClass}
        isDisabled={isDisabledState}
        tooltip={selectedFormatLabel}
        triggerDisplay="icon-only"
        placeholder="Format"
      />
    </div>
  );
});

export default PromptBarFormatControls;
