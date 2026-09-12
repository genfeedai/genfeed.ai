'use client';

import {
  ButtonVariant,
  IngredientCategory,
  ModelCategory,
} from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { getVideoResolutionsByModel } from '@genfeedai/helpers/media/video-resolution/video-resolution.helper';
import type { PromptBarQuickOptionsProps } from '@genfeedai/props/prompt-bars/prompt-bar-tiers.props';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import FormDropdown from '@ui/primitives/dropdown-field';
import PromptBarFrameControls from '@ui/prompt-bars/components/frame-controls/PromptBarFrameControls';
import { ChevronDown, ChevronUp, Tv } from 'lucide-react';
import { type ChangeEvent, memo, useState } from 'react';

function buildResolutionOptions(
  normalizedWatchedModels: string[],
): Array<{ key: string; label: string }> {
  const resolutionMap = new Map<string, { value: string; label: string }>();

  for (const modelKey of normalizedWatchedModels) {
    for (const res of getVideoResolutionsByModel(modelKey)) {
      if (!resolutionMap.has(res.label)) {
        resolutionMap.set(res.label, res);
      }
    }
  }

  return Array.from(resolutionMap.values()).map((res) => ({
    key: res.value,
    label: res.label,
  }));
}

interface PromptBarQuickOptionsWrapperProps extends PromptBarQuickOptionsProps {
  hasAnyResolutionOptionsValue: boolean;
}

const PromptBarQuickOptions = memo(function PromptBarQuickOptions({
  currentConfig,
  categoryType,
  currentModelCategory,
  form,
  isDisabledState,
  controlClass,
  iconButtonClass,
  isAdvancedControlsEnabled,
  normalizedWatchedModels,
  watchedFormat,
  watchedWidth,
  watchedHeight,
  hasAudioToggleValue,
  hasEndFrameValue,
  hasAnyImagenModelValue,
  isOnlyImagenModelsValue,
  supportsInterpolation,
  supportsMultipleReferences,
  requiresReferences,
  maxReferenceCount,
  references,
  setReferences,
  endFrame,
  setEndFrame,
  referenceSource,
  setReferenceSource,
  triggerConfigChange,
  openGallery,
  openUpload,
  hasAnyResolutionOptionsValue,
  isExpanded,
  onToggleExpanded,
  showToggle = true,
  inlineContent,
}: PromptBarQuickOptionsWrapperProps) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = isExpanded ?? localExpanded;

  const handleToggle = () => {
    if (onToggleExpanded) {
      onToggleExpanded();
      return;
    }
    setLocalExpanded((value) => !value);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {showToggle && (
        <Button
          variant={ButtonVariant.GHOST}
          onClick={handleToggle}
          className="flex items-center gap-1.5 text-xs font-medium text-foreground/50 hover:text-foreground/70 self-start"
          icon={
            expanded ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )
          }
        >
          Options
        </Button>
      )}

      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
          expanded
            ? 'grid-rows-[1fr] opacity-100'
            : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div
          className={cn(
            'min-h-0',
            expanded ? 'overflow-visible' : 'overflow-hidden',
            !expanded && 'pointer-events-none',
          )}
        >
          <div className="flex w-full items-center justify-between gap-3 overflow-visible pt-0.5">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 overflow-visible">
              {inlineContent}

              {isAdvancedControlsEnabled &&
                categoryType === IngredientCategory.VIDEO &&
                hasAnyResolutionOptionsValue && (
                  <FormDropdown
                    key="resolution"
                    name="resolution"
                    icon={<Tv />}
                    label="Resolution"
                    value={form.getValues('resolution')}
                    isDisabled={isDisabledState}
                    isNoneEnabled={false}
                    isFullWidth={false}
                    className={controlClass}
                    dropdownDirection="up"
                    options={buildResolutionOptions(normalizedWatchedModels)}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                      form.setValue('resolution', e.target.value, {
                        shouldValidate: true,
                      });
                      triggerConfigChange();
                    }}
                  />
                )}

              {isAdvancedControlsEnabled &&
                categoryType === IngredientCategory.VIDEO &&
                hasAudioToggleValue && (
                  <Checkbox
                    key="isAudioEnabled"
                    name="isAudioEnabled"
                    label="Audio"
                    isChecked={form.getValues('isAudioEnabled') ?? true}
                    isDisabled={isDisabledState}
                    onChange={(e) => {
                      form.setValue('isAudioEnabled', e.target.checked, {
                        shouldValidate: true,
                      });
                      triggerConfigChange();
                    }}
                    className="text-sm"
                    data-testid="audio-toggle"
                  />
                )}

              {currentConfig.buttons?.reference && !isOnlyImagenModelsValue && (
                <PromptBarFrameControls
                  hasEndFrame={hasEndFrameValue}
                  hasInterpolation={supportsInterpolation}
                  supportsMultipleReferences={supportsMultipleReferences}
                  requiresReferences={requiresReferences}
                  maxReferenceCount={maxReferenceCount}
                  isVideoModel={currentModelCategory === ModelCategory.VIDEO}
                  hasAnyImagenModel={hasAnyImagenModelValue}
                  references={references}
                  endFrame={endFrame}
                  referenceSource={referenceSource}
                  onReferencesChange={setReferences}
                  onReferenceSourceChange={setReferenceSource}
                  onEndFrameChange={setEndFrame}
                  openGallery={openGallery}
                  openUpload={openUpload}
                  form={form}
                  watchedFormat={watchedFormat}
                  watchedWidth={watchedWidth}
                  watchedHeight={watchedHeight}
                  disabled={isDisabledState}
                  iconButtonClass={iconButtonClass}
                  showReference={true}
                  triggerConfigChange={triggerConfigChange}
                />
              )}
            </div>

            {currentConfig.buttons?.model && (
              <Checkbox
                key="brandingMode"
                name="brandingMode"
                label="Branding"
                isChecked={form.getValues('brandingMode') === 'brand'}
                isDisabled={isDisabledState}
                onChange={(e) => {
                  form.setValue(
                    'brandingMode',
                    e.target.checked ? 'brand' : 'off',
                    {
                      shouldValidate: true,
                    },
                  );
                  triggerConfigChange();
                }}
                className="shrink-0 text-sm"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default PromptBarQuickOptions;
