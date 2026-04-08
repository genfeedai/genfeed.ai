'use client';

import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import { ButtonVariant, IngredientCategory } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { PromptBarSuggestionItem } from '@props/prompt-bars/prompt-bar-suggestion-item.props';
import type { PromptBarEssentialsProps } from '@props/prompt-bars/prompt-bar-tiers.props';
import { EnvironmentService } from '@services/core/environment.service';
import { Button } from '@ui/primitives/button';
import FormDropdown from '@ui/primitives/dropdown-field';
import { Textarea } from '@ui/primitives/textarea';
import PromptBarDivider from '@ui/prompt-bars/components/divider/PromptBarDivider';
import PromptBarFormatControls from '@ui/prompt-bars/components/format-controls/PromptBarFormatControls';
import PromptBarModelControls from '@ui/prompt-bars/components/model-controls/PromptBarModelControls';
import PromptBarQualityControls from '@ui/prompt-bars/components/quality-controls/PromptBarQualityControls';
import PromptBarShell from '@ui/prompt-bars/components/shell/PromptBarShell';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import Image from 'next/image';
import { type ChangeEvent, memo } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import {
  HiAdjustmentsHorizontal,
  HiArrowUp,
  HiArrowUturnLeft,
  HiChevronUp,
  HiClipboard,
  HiClock,
  HiMicrophone,
  HiSparkles,
} from 'react-icons/hi2';

function getVoiceTooltip(isRecording: boolean, isProcessing: boolean): string {
  if (isRecording) {
    return 'Stop recording';
  }
  if (isProcessing) {
    return 'Processing...';
  }
  return 'Voice input (Speak to transcribe)';
}

const PromptBarEssentials = memo(function PromptBarEssentials({
  currentConfig,
  categoryType,
  currentModelCategory,
  shellMode = 'legacy-collapsible',
  form,
  isDisabledState,
  isGenerateBlocked,
  controlClass,
  iconButtonClass,
  isAdvancedMode,
  isAdvancedControlsEnabled,
  models,
  trainings,
  selectedModels,
  trainingIds,
  normalizedWatchedModels,
  watchedModels,
  watchedModel,
  watchedFormat,
  watchedQuality,
  subscriptionTier,
  isModelNotSet,
  hasModelWithoutDurationEditingValue,
  formatIcon,
  videoDurations,
  references,
  referenceSource,
  setReferences,
  setReferenceSource,
  triggerConfigChange,
  handleTextareaChange,
  onTextChange,
  onToggleQuickOptions,
  isQuickOptionsOpen,
  handleCopy,
  enhancePrompt,
  handleUndo,
  handleSubmitForm,
  onToggleCollapse,
  secondaryContent,
  suggestions = [],
  onSuggestionSelect,
  showSuggestionsWhenEmpty = true,
  maxSuggestions = 3,
  textareaRef,
  textareaRegister,
  modelDropdownRef,
  promptBarHeight,
  getModelDefaultDuration,
  getDefaultVideoResolution,
  getMinFromAllModels,
  getModelMaxOutputs,
  setTextValue,
  isSupported,
  toggleVoice,
  isRecording,
  isProcessing,
  isGenerating,
  isEnhancing,
  isGenerateDisabled,
  previousPrompt,
  activeGenerations,
  generateLabel,
  avatars = [],
  voices = [],
}: PromptBarEssentialsProps) {
  const isUnifiedShell = shellMode === 'studio-unified';
  const watchedTextTrimmed = form.watch('text')?.trim();
  const hasVisibleReferences = references.length > 0;
  const firstReference = hasVisibleReferences ? references[0] : null;
  const shouldShowSuggestions =
    showSuggestionsWhenEmpty && !watchedTextTrimmed && suggestions.length > 0;

  const handleSuggestionSelect = (item: PromptBarSuggestionItem) => {
    if (onSuggestionSelect) {
      onSuggestionSelect(item);
      return;
    }

    form.setValue('text', item.prompt, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    setTextValue(item.prompt);
    onTextChange?.(item.prompt);
    triggerConfigChange();

    const textarea = textareaRef.current;
    if (textarea) {
      textarea.value = item.prompt;
      textarea.focus();
      const cursorPosition = item.prompt.length;
      textarea.setSelectionRange(cursorPosition, cursorPosition);
    }
  };

  return (
    <div className="flex flex-col gap-1 w-full">
      <PromptBarShell className="p-2">
        {onToggleCollapse && (
          <Button
            onClick={onToggleCollapse}
            tooltip="Collapse"
            tooltipPosition="left"
            variant={ButtonVariant.GHOST}
            className="absolute right-2 top-2 h-8 w-8 rounded-full border border-white/10 bg-black/20 p-0 text-white/70 backdrop-blur-sm hover:bg-black/30 hover:text-white"
            icon={<HiChevronUp className="w-4 h-4" />}
            data-testid="collapse-button"
          />
        )}

        <Textarea<PromptTextareaSchema>
          name="text"
          register={
            textareaRegister as unknown as UseFormRegisterReturn<'text'>
          }
          textareaRef={textareaRef}
          placeholder={currentConfig.placeholder}
          isDisabled={isDisabledState}
          onChange={handleTextareaChange}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              handleSubmitForm();
            }
          }}
          maxHeight={isUnifiedShell ? 240 : 300}
          className={cn(
            'w-full resize-none border-0 bg-transparent px-2 py-2 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0',
            isUnifiedShell ? 'min-h-[96px] pr-12' : 'min-h-[72px] pr-24',
          )}
          data-testid="prompt-textarea"
        />

        {shouldShowSuggestions && (
          <div className="mt-3">
            <PromptBarSuggestions
              suggestions={suggestions}
              onSuggestionSelect={handleSuggestionSelect}
              isDisabled={isDisabledState}
              maxSuggestions={maxSuggestions}
            />
          </div>
        )}

        {secondaryContent && (
          <div className="mt-2 border-t border-white/8 pt-2">
            {secondaryContent}
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/8 pt-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 overflow-visible">
            {isAdvancedMode &&
            currentConfig.buttons?.model &&
            models.length > 0 ? (
              <PromptBarModelControls
                isAdvancedMode={isAdvancedMode}
                hasModelButton={Boolean(currentConfig.buttons?.model)}
                models={models}
                trainings={trainings}
                trainingIds={trainingIds}
                watchedFormat={watchedFormat}
                normalizedWatchedModels={normalizedWatchedModels}
                selectedModels={selectedModels}
                watchedModels={watchedModels}
                modelDropdownRef={modelDropdownRef}
                promptBarHeight={promptBarHeight}
                isModelNotSet={isModelNotSet}
                controlClass={controlClass}
                form={form}
                getModelDefaultDuration={getModelDefaultDuration}
                getDefaultVideoResolution={getDefaultVideoResolution}
                triggerConfigChange={triggerConfigChange}
                currentModelCategory={currentModelCategory}
              />
            ) : (
              <PromptBarQualityControls
                watchedQuality={watchedQuality}
                controlClass={controlClass}
                isDisabled={isDisabledState}
                form={form}
                triggerConfigChange={triggerConfigChange}
                subscriptionTier={subscriptionTier}
              />
            )}

            <PromptBarFormatControls
              currentConfig={currentConfig}
              formatIcon={formatIcon}
              form={form}
              normalizedWatchedModels={normalizedWatchedModels}
              watchedModel={watchedModel}
              references={references}
              setReferences={setReferences}
              setReferenceSource={setReferenceSource}
              triggerConfigChange={triggerConfigChange}
              isDisabledState={isDisabledState}
              controlClass={controlClass}
            />

            {categoryType === IngredientCategory.AVATAR &&
              avatars.length > 0 && (
                <FormDropdown
                  name="avatarId"
                  options={avatars}
                  value={form.watch('avatarId') || ''}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                    form.setValue('avatarId', e.target.value, {
                      shouldValidate: true,
                    });
                    triggerConfigChange();
                  }}
                  className={controlClass}
                  isDisabled={isDisabledState}
                  isFullWidth={false}
                  placeholder="Select Avatar"
                />
              )}

            {categoryType === IngredientCategory.AVATAR &&
              voices.length > 0 && (
                <FormDropdown
                  name="voiceId"
                  options={voices}
                  value={form.watch('voiceId') || ''}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                    form.setValue('voiceId', e.target.value, {
                      shouldValidate: true,
                    });
                    triggerConfigChange();
                  }}
                  className={controlClass}
                  isDisabled={isDisabledState}
                  isFullWidth={false}
                  placeholder="Select Voice"
                />
              )}

            {isAdvancedControlsEnabled &&
              (categoryType === IngredientCategory.VIDEO ||
                categoryType === IngredientCategory.MUSIC) &&
              videoDurations.length > 0 && (
                <FormDropdown
                  key="duration"
                  name="duration"
                  icon={<HiClock />}
                  label="Duration"
                  value={form.getValues('duration')?.toString()}
                  isNoneEnabled={false}
                  isFullWidth={false}
                  className={controlClass}
                  dropdownDirection="up"
                  options={videoDurations.map((duration) => ({
                    key: duration.toString(),
                    label: `${duration}s`,
                  }))}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                    const value = e.target.value;
                    form.setValue('duration', parseInt(value, 10), {
                      shouldDirty: false,
                      shouldValidate: false,
                    });
                    triggerConfigChange();
                  }}
                  isDisabled={
                    isDisabledState || hasModelWithoutDurationEditingValue
                  }
                />
              )}

            {isUnifiedShell ? null : (
              <PromptBarDivider className="h-5 bg-white/10" />
            )}

            {isUnifiedShell && hasVisibleReferences && firstReference && (
              <Button
                onClick={onToggleQuickOptions}
                variant={ButtonVariant.GHOST}
                className="h-9 px-2 pr-2.5 gap-2 text-white/80 hover:text-white"
                tooltip={
                  references.length > 1
                    ? `${references.length} references selected`
                    : 'Reference selected'
                }
                tooltipPosition="top"
                ariaLabel="Open reference controls"
              >
                <span className="relative h-5 w-5 overflow-hidden rounded">
                  <Image
                    src={
                      referenceSource === 'brand'
                        ? `${EnvironmentService.ingredientsEndpoint}/references/${firstReference.id}`
                        : `${EnvironmentService.ingredientsEndpoint}/images/${firstReference.id}`
                    }
                    alt="Reference preview"
                    fill
                    sizes="20px"
                    className="object-cover"
                  />
                </span>
                <span className="text-xs">
                  {references.length > 1 ? `${references.length} refs` : 'Ref'}
                </span>
              </Button>
            )}

            <Button
              onClick={onToggleQuickOptions}
              variant={ButtonVariant.GHOST}
              className={cn(
                iconButtonClass,
                isQuickOptionsOpen && 'bg-white/8 text-white',
              )}
              tooltip={isQuickOptionsOpen ? 'Hide settings' : 'Show settings'}
              tooltipPosition="top"
              ariaLabel={isQuickOptionsOpen ? 'Hide settings' : 'Show settings'}
              icon={<HiAdjustmentsHorizontal className="w-4 h-4" />}
            />

            {watchedTextTrimmed && (
              <Button
                onClick={() => handleCopy(form.getValues('text'))}
                isDisabled={isDisabledState}
                tooltip="Copy prompt"
                tooltipPosition="top"
                variant={ButtonVariant.GHOST}
                className={iconButtonClass}
                icon={<HiClipboard className="w-4 h-4" />}
              />
            )}

            {watchedTextTrimmed && (
              <Button
                onClick={enhancePrompt}
                isDisabled={isDisabledState || isEnhancing}
                tooltip={
                  isEnhancing ? 'Enhancing...' : 'Enhance prompt with AI'
                }
                tooltipPosition="top"
                variant={ButtonVariant.GHOST}
                className={cn(iconButtonClass, isEnhancing && 'animate-pulse')}
                icon={<HiSparkles className="w-4 h-4" />}
              />
            )}

            {previousPrompt && (
              <Button
                onClick={handleUndo}
                isDisabled={isDisabledState}
                tooltip="Undo enhancement"
                tooltipPosition="top"
                variant={ButtonVariant.GHOST}
                className={iconButtonClass}
                icon={<HiArrowUturnLeft className="w-4 h-4" />}
              />
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {isUnifiedShell && (
              <Button
                label={`${form.watch('outputs') || 1}x`}
                variant={ButtonVariant.GHOST}
                className="h-9 px-2.5 gap-1"
                tooltip="Number of outputs"
                tooltipPosition="top"
                icon={
                  <span className="w-4 h-4 flex items-center justify-center text-xs font-medium">
                    #
                  </span>
                }
                isDisabled={isDisabledState}
                onClick={() => {
                  const current = form.watch('outputs') || 1;
                  const max = getMinFromAllModels(getModelMaxOutputs);
                  const next = current >= max ? 1 : current + 1;

                  form.setValue('outputs', next, { shouldValidate: true });
                  triggerConfigChange();
                }}
                data-testid="outputs-button"
              />
            )}

            {!isUnifiedShell && (
              <>
                <Button
                  label={`${form.watch('outputs') || 1}x`}
                  variant={ButtonVariant.GHOST}
                  className="h-9 px-2.5 gap-1"
                  tooltip="Number of outputs"
                  tooltipPosition="top"
                  icon={
                    <span className="w-4 h-4 flex items-center justify-center text-xs font-medium">
                      #
                    </span>
                  }
                  isDisabled={isDisabledState}
                  onClick={() => {
                    const current = form.watch('outputs') || 1;
                    const max = getMinFromAllModels(getModelMaxOutputs);
                    const next = current >= max ? 1 : current + 1;

                    form.setValue('outputs', next, { shouldValidate: true });
                    triggerConfigChange();
                  }}
                  data-testid="outputs-button"
                />

                <PromptBarDivider className="h-5 bg-white/10" />
              </>
            )}

            {isSupported && (isUnifiedShell || !watchedTextTrimmed) ? (
              <Button
                onClick={toggleVoice}
                variant={
                  isRecording ? ButtonVariant.DESTRUCTIVE : ButtonVariant.GHOST
                }
                className={cn(
                  'h-9 px-3 transition-all duration-300 flex-shrink-0',
                  isRecording && 'animate-pulse',
                )}
                isDisabled={isGenerateBlocked || isProcessing}
                tooltip={getVoiceTooltip(isRecording, isProcessing)}
                tooltipPosition="top"
                icon={<HiMicrophone className="w-4 h-4" />}
              >
                {isUnifiedShell ? null : 'Voice'}
              </Button>
            ) : null}

            <Button
              variant={ButtonVariant.GENERATE}
              icon={<HiArrowUp />}
              isDisabled={
                isGenerateBlocked ||
                isGenerateDisabled ||
                !form.formState.isValid ||
                !watchedTextTrimmed
              }
              isLoading={isGenerating}
              onClick={() => handleSubmitForm()}
              tooltip={
                activeGenerations.length > 0
                  ? `${generateLabel} (Queue)`
                  : generateLabel
              }
              tooltipPosition="top"
              ariaLabel={
                activeGenerations.length > 0
                  ? `${generateLabel} (Queue)`
                  : generateLabel
              }
              className={cn('transition-all duration-300', 'h-9 w-9 p-0')}
              data-testid="generate-button"
            />
          </div>
        </div>
      </PromptBarShell>

      {selectedModels.length > 0 && selectedModels.some((m) => m.trigger) && (
        <p className="text-xs text-foreground/60">
          Tip: Include trigger words:{' '}
          {selectedModels
            .filter((m) => m.trigger)
            .map((m) => `"${m.trigger}"`)
            .join(', ')}
        </p>
      )}
    </div>
  );
});

export default PromptBarEssentials;
