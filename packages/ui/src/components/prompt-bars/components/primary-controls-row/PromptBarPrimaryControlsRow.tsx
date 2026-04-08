'use client';

import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
} from '@genfeedai/enums';
import { getVideoResolutionsByModel } from '@helpers/media/video-resolution/video-resolution.helper';
import type { PromptBarPrimaryControlsRowProps } from '@props/prompt-bars/prompt-bar-layout.props';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import FormDropdown from '@ui/primitives/dropdown-field';
import PromptBarFormatControls from '@ui/prompt-bars/components/format-controls/PromptBarFormatControls';
import PromptBarModelControls from '@ui/prompt-bars/components/model-controls/PromptBarModelControls';
import PromptBarQualityControls from '@ui/prompt-bars/components/quality-controls/PromptBarQualityControls';
import { type ChangeEvent, memo, useMemo } from 'react';
import { HiChevronUp, HiClock, HiTv } from 'react-icons/hi2';

const PromptBarPrimaryControlsRow = memo(function PromptBarPrimaryControlsRow({
  isAdvancedControlsEnabled,
  modelControlsProps,
  qualityControlsProps,
  formatControlsProps,
  videoDurations,
  categoryType,
  form,
  controlClass,
  isDisabledState,
  hasModelWithoutDurationEditing,
  hasAnyResolutionOptions,
  normalizedWatchedModels,
  triggerConfigChange,
  hasAudioToggle,
  onToggleCollapse,
}: PromptBarPrimaryControlsRowProps) {
  const shouldShowDuration =
    isAdvancedControlsEnabled &&
    (categoryType === IngredientCategory.VIDEO ||
      categoryType === IngredientCategory.MUSIC) &&
    videoDurations.length > 0;

  const shouldShowResolution =
    isAdvancedControlsEnabled &&
    categoryType === IngredientCategory.VIDEO &&
    hasAnyResolutionOptions;

  const resolutionOptions = useMemo(() => {
    if (!shouldShowResolution) {
      return [];
    }

    const resolutionMap = new Map<string, { value: string; label: string }>();

    normalizedWatchedModels.forEach((modelKey: string) => {
      const resolutions = getVideoResolutionsByModel(modelKey);

      resolutions.forEach((resolution) => {
        if (!resolutionMap.has(resolution.label)) {
          resolutionMap.set(resolution.label, resolution);
        }
      });
    });

    return Array.from(resolutionMap.values());
  }, [shouldShowResolution, normalizedWatchedModels]);

  const shouldShowAudioToggle =
    isAdvancedControlsEnabled &&
    categoryType === IngredientCategory.VIDEO &&
    hasAudioToggle;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 overflow-visible">
      <div className="flex flex-wrap items-center gap-2">
        {isAdvancedControlsEnabled ? (
          <PromptBarModelControls {...modelControlsProps} />
        ) : (
          <PromptBarQualityControls {...qualityControlsProps} />
        )}

        <PromptBarFormatControls {...formatControlsProps} />

        {shouldShowDuration && (
          <FormDropdown
            key="duration"
            name="duration"
            icon={<HiClock />}
            label="Duration"
            triggerDisplay="icon-only"
            value={form.getValues('duration')?.toString()}
            isNoneEnabled={false}
            isFullWidth={false}
            className={controlClass}
            dropdownDirection="up"
            options={videoDurations.map((duration) => ({
              key: duration.toString(),
              label: `${duration}s`,
            }))}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              const value = event.target.value;
              form.setValue('duration', parseInt(value, 10), {
                shouldDirty: false,
                shouldValidate: false,
              });
              triggerConfigChange();
            }}
            isDisabled={isDisabledState || hasModelWithoutDurationEditing}
          />
        )}

        {resolutionOptions.length > 0 && (
          <FormDropdown
            key="resolution"
            name="resolution"
            icon={<HiTv />}
            label="Resolution"
            triggerDisplay="icon-only"
            value={form.getValues('resolution')}
            isDisabled={isDisabledState}
            isNoneEnabled={false}
            isFullWidth={false}
            className={controlClass}
            dropdownDirection="up"
            options={resolutionOptions.map((resolution) => ({
              key: resolution.value,
              label: resolution.label,
            }))}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              const value = event.target.value;
              form.setValue('resolution', value, {
                shouldDirty: false,
                shouldValidate: false,
              });
              triggerConfigChange();
            }}
          />
        )}

        {shouldShowAudioToggle && (
          <Checkbox
            key="isAudioEnabled"
            name="isAudioEnabled"
            label="Audio"
            isChecked={form.getValues('isAudioEnabled') ?? true}
            isDisabled={isDisabledState}
            onChange={(event) => {
              form.setValue('isAudioEnabled', event.target.checked, {
                shouldValidate: true,
              });
            }}
            className="text-sm"
          />
        )}
      </div>

      <Button
        onClick={onToggleCollapse}
        tooltip="Collapse"
        tooltipPosition="top"
        variant={ButtonVariant.GHOST}
        size={ButtonSize.SM}
        className="h-10 w-10 p-0"
        icon={
          <HiChevronUp className="transition-transform rotate-180 w-4 h-4" />
        }
      />
    </div>
  );
});

export default PromptBarPrimaryControlsRow;
