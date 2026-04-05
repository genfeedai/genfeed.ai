'use client';

import { IngredientCategory, ModelCategory } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { getVideoResolutionsByModel } from '@helpers/media/video-resolution/video-resolution.helper';
import type { PromptBarQuickOptionsProps } from '@props/prompt-bars/prompt-bar-tiers.props';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import FormCheckbox from '@ui/forms/selectors/checkbox/form-checkbox/FormCheckbox';
import FormDropdown from '@ui/forms/selectors/dropdown/form-dropdown/FormDropdown';
import PromptBarFrameControls from '@ui/prompt-bars/components/frame-controls/PromptBarFrameControls';
import { type ChangeEvent, memo, useState } from 'react';
import {
  HiChevronDown,
  HiChevronUp,
  HiMusicalNote,
  HiTv,
} from 'react-icons/hi2';

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
        <button
          type="button"
          onClick={handleToggle}
          className="flex items-center gap-1.5 text-xs font-medium text-foreground/50 hover:text-foreground/70 transition-colors self-start"
        >
          {expanded ? (
            <HiChevronUp className="w-3.5 h-3.5" />
          ) : (
            <HiChevronDown className="w-3.5 h-3.5" />
          )}
          Options
        </button>
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
                    icon={<HiTv />}
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
                  <FormCheckbox
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

              {isAdvancedControlsEnabled &&
                categoryType === IngredientCategory.VIDEO && (
                  <FormCheckbox
                    key="isBackgroundMusicEnabled"
                    name="isBackgroundMusicEnabled"
                    label="Background Music"
                    isChecked={
                      form.getValues('isBackgroundMusicEnabled') ?? false
                    }
                    isDisabled={isDisabledState}
                    onChange={(e) => {
                      form.setValue(
                        'isBackgroundMusicEnabled',
                        e.target.checked,
                        {
                          shouldValidate: true,
                        },
                      );
                      if (!e.target.checked) {
                        form.setValue('backgroundMusicMode', undefined, {
                          shouldValidate: true,
                        });
                        form.setValue('backgroundMusicId', undefined, {
                          shouldValidate: true,
                        });
                        form.setValue('backgroundMusicPrompt', undefined, {
                          shouldValidate: true,
                        });
                      } else {
                        form.setValue('backgroundMusicMode', 'generate', {
                          shouldValidate: true,
                        });
                      }
                      triggerConfigChange();
                    }}
                    className="text-sm"
                    data-testid="background-music-toggle"
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
              <FormCheckbox
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

      {/* Background Music Configuration \u2014 shown when music is enabled */}
      {expanded &&
        isAdvancedControlsEnabled &&
        categoryType === IngredientCategory.VIDEO &&
        form.getValues('isBackgroundMusicEnabled') && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] p-2">
            <FormDropdown
              name="backgroundMusicMode"
              label="Music Source"
              value={form.getValues('backgroundMusicMode') || 'generate'}
              isNoneEnabled={false}
              isFullWidth={false}
              className={controlClass}
              dropdownDirection="up"
              options={[
                { key: 'generate', label: 'Auto-generate' },
                { key: 'existing', label: 'Select existing' },
              ]}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                form.setValue(
                  'backgroundMusicMode',
                  e.target.value as 'existing' | 'generate',
                  { shouldValidate: true },
                );
                triggerConfigChange();
              }}
              isDisabled={isDisabledState}
            />

            {form.getValues('backgroundMusicMode') === 'generate' && (
              <FormInput
                name="backgroundMusicPrompt"
                type="text"
                placeholder="Describe the music (e.g., upbeat electronic, calm piano)"
                value={form.getValues('backgroundMusicPrompt') || ''}
                className="flex-1 min-w-48 border border-white/15 bg-white/5 text-sm h-10 px-3"
                isDisabled={isDisabledState}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  form.setValue('backgroundMusicPrompt', e.target.value, {
                    shouldValidate: true,
                  });
                  triggerConfigChange();
                }}
              />
            )}

            <FormDropdown
              name="musicVolume"
              icon={<HiMusicalNote className="w-4 h-4" />}
              label="Volume"
              value={(form.getValues('musicVolume') ?? 30).toString()}
              isNoneEnabled={false}
              isFullWidth={false}
              className={controlClass}
              dropdownDirection="up"
              options={[
                { key: '10', label: '10%' },
                { key: '20', label: '20%' },
                { key: '30', label: '30%' },
                { key: '50', label: '50%' },
                { key: '70', label: '70%' },
                { key: '100', label: '100%' },
              ]}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                form.setValue('musicVolume', parseInt(e.target.value, 10), {
                  shouldValidate: true,
                });
                triggerConfigChange();
              }}
              isDisabled={isDisabledState}
            />

            <FormCheckbox
              name="muteVideoAudio"
              label="Mute original audio"
              isChecked={form.getValues('muteVideoAudio') ?? false}
              isDisabled={isDisabledState}
              onChange={(e) => {
                form.setValue('muteVideoAudio', e.target.checked, {
                  shouldValidate: true,
                });
                triggerConfigChange();
              }}
              className="text-sm"
            />
          </div>
        )}
    </div>
  );
});

export default PromptBarQuickOptions;
