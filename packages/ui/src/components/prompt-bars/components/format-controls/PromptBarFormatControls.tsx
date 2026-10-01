'use client';

import { PromptBarInternalContext } from '@genfeedai/contexts/ui/prompt-bar-internal-context';
import type { IngredientFormat } from '@genfeedai/contracts';
import { isAspectRatioSupported } from '@genfeedai/helpers/aspect-ratio.helper';
import { formatVideos } from '@genfeedai/helpers/data/data/data.helper';
import {
  getAspectRatioForFormat,
  getFormatForAspectRatio,
} from '@genfeedai/helpers/generation-controls.helper';
import type { PromptBarFormatControlsProps } from '@genfeedai/props/studio/prompt-bar.props';
import AspectRatioDropdown from '@ui/dropdowns/aspect-ratio/AspectRatioDropdown';
import { memo, useContext } from 'react';

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
  const context = useContext(PromptBarInternalContext);
  const selected =
    context?.models.filter((model) =>
      normalizedWatchedModels.includes(model.key),
    ) ?? [];
  const controls =
    selected.length === 1 && selected[0]?.provider === 'crun'
      ? selected[0].inputControls
      : undefined;
  if (!currentConfig.buttons?.format) {
    return null;
  }

  const modelsToCheck =
    normalizedWatchedModels.length > 0
      ? normalizedWatchedModels
      : [watchedModel];

  const reviewedRatios = controls?.fields.aspect_ratio?.enum?.filter(
    (value): value is string =>
      typeof value === 'string' &&
      (value !== 'auto' ||
        references.length > 0 ||
        !controls.isAutoAspectReferenceRequired),
  );
  const filteredRatios =
    reviewedRatios ??
    formatVideos.reduce<string[]>((acc, format) => {
      if (format.isDisabled) {
        return acc;
      }

      const aspectRatio = getAspectRatioForFormat(format.id);
      if (!aspectRatio) {
        // Include format but no ratio string to add — skip per original logic
        return acc;
      }

      const isSupported = modelsToCheck.some(
        (modelKey: string) =>
          modelKey && isAspectRatioSupported(modelKey, aspectRatio),
      );

      if (isSupported) {
        acc.push(aspectRatio);
      }
      return acc;
    }, []);

  const selectedFormatLabel =
    (controls
      ? form.getValues('crunControls')?.aspectRatio
      : getAspectRatioForFormat(
          form.getValues('format') as IngredientFormat,
        )) ?? 'Format';

  function handleFormatChange(_name: string, value: string): void {
    if (controls) {
      const current = form.getValues('crunControls');
      if (current && filteredRatios.includes(value)) {
        form.setValue(
          'crunControls',
          { ...current, aspectRatio: value },
          { shouldValidate: true },
        );
        triggerConfigChange();
      }
      return;
    }
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

    if (!controls && previousFormat !== nextFormatId && references.length > 0) {
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
        value={
          (controls
            ? form.getValues('crunControls')?.aspectRatio
            : getAspectRatioForFormat(form.getValues('format'))) ?? ''
        }
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
