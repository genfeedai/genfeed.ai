'use client';

import { ButtonVariant, IngredientCategory } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptBarSuggestionItem } from '@genfeedai/props/prompt-bars/prompt-bar-suggestion-item.props';
import type { PromptBarEssentialsProps } from '@genfeedai/props/prompt-bars/prompt-bar-tiers.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { Button } from '@ui/primitives/button';
import FormDropdown from '@ui/primitives/dropdown-field';
import PromptBarDivider from '@ui/prompt-bars/components/divider/PromptBarDivider';
import PromptBarFormatControls from '@ui/prompt-bars/components/format-controls/PromptBarFormatControls';
import PromptBarGenerationMeter from '@ui/prompt-bars/components/generation-meter/PromptBarGenerationMeter';
import PromptBarModelControls from '@ui/prompt-bars/components/model-controls/PromptBarModelControls';
import PromptBarQualityControls from '@ui/prompt-bars/components/quality-controls/PromptBarQualityControls';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import {
  ArrowUp,
  ChevronUp,
  Clipboard,
  Clock,
  Mic,
  SlidersHorizontal,
  Sparkles,
  Square,
  Undo2,
} from 'lucide-react';
import Image from 'next/image';
import { type ChangeEvent, memo, useCallback } from 'react';

function getVoiceTooltip(isRecording: boolean, isProcessing: boolean): string {
  if (isRecording) {
    return 'Stop recording';
  }
  if (isProcessing) {
    return 'Processing…';
  }
  return 'Voice input (Speak to transcribe)';
}

type PromptOutputsButtonProps = Pick<
  PromptBarEssentialsProps,
  'form' | 'getMinFromAllModels' | 'getModelMaxOutputs' | 'triggerConfigChange'
> & {
  isDisabledState: boolean;
};

const PromptOutputsButton = memo(function PromptOutputsButton({
  form,
  getMinFromAllModels,
  getModelMaxOutputs,
  isDisabledState,
  triggerConfigChange,
}: PromptOutputsButtonProps) {
  return (
    <Button
      label={`${form.watch('outputs') || 1}x`}
      variant={ButtonVariant.GHOST}
      className="h-9 px-2.5 gap-1"
      tooltip="Number of outputs"
      tooltipPosition="top"
      icon={
        <span className="size-4 flex items-center justify-center text-xs font-medium">
          #
        </span>
      }
      isDisabled={isDisabledState}
      onClick={() => {
        const current = form.getValues('outputs') ?? 1;
        const max = getMinFromAllModels(getModelMaxOutputs);
        const next = current >= max ? 1 : current + 1;

        form.setValue('outputs', next, { shouldValidate: true });
        triggerConfigChange();
      }}
      data-testid="outputs-button"
    />
  );
});

const PromptBarEssentials = memo(function PromptBarEssentials({
  currentConfig,
  categoryType,
  currentModelCategory,
  features = {},
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
  onCancel,
  onToggleCollapse,
  secondaryContent,
  suggestions = [],
  onSuggestionSelect,
  showSuggestionsWhenEmpty = true,
  maxSuggestions = 3,
  textareaRef: _textareaRef,
  textareaRegister: _textareaRegister,
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
  generationMeter,
  activeGenerations,
  generateLabel,
  avatars = [],
  voices = [],
  extraExtensions,
  onDocumentChange,
}: PromptBarEssentialsProps) {
  const isCollapsible = features.collapsible ?? true;
  // Simple mode (Advanced Mode off) strips the bar to its essentials: type,
  // speak, generate. Model, quality, format, and output choices are
  // auto-selected by the backend from the prompt.
  const isMinimalBar = !isAdvancedMode;
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
  };

  const handleEditorValueChange = useCallback(
    (plainText: string) => {
      form.setValue('text', plainText, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      handleTextareaChange();
    },
    [form, handleTextareaChange],
  );

  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="relative p-2">
        {onToggleCollapse && !isMinimalBar && (
          <Button
            onClick={onToggleCollapse}
            tooltip="Collapse"
            tooltipPosition="left"
            variant={ButtonVariant.GHOST}
            className="absolute right-2 top-2 size-8 rounded-md border border-border bg-background/20 p-0 text-muted-foreground backdrop-blur-sm hover:bg-hover hover:text-foreground"
            icon={<ChevronUp className="size-4" />}
            data-testid="collapse-button"
          />
        )}

        <PromptEditor
          ariaLabel="Prompt"
          className={cn(
            'min-h-9 w-full px-2 py-2',
            isMinimalBar ? 'pr-4' : isCollapsible ? 'pr-24' : 'pr-12',
          )}
          extraExtensions={extraExtensions}
          isDisabled={isDisabledState}
          onDocumentChange={onDocumentChange}
          onSubmit={handleSubmitForm}
          onValueChange={handleEditorValueChange}
          placeholder={currentConfig.placeholder}
          testId="prompt-textarea"
          value={form.watch('text') ?? ''}
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
            {!isMinimalBar &&
              (isAdvancedMode &&
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
              ))}

            {!isMinimalBar && (
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
            )}

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
                  icon={<Clock />}
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

            {isCollapsible && !isMinimalBar ? (
              <PromptBarDivider className="h-5 bg-border" />
            ) : null}

            {!isCollapsible && hasVisibleReferences && firstReference && (
              <Button
                onClick={onToggleQuickOptions}
                variant={ButtonVariant.GHOST}
                className="h-9 gap-2 px-2 pr-2.5 text-muted-foreground hover:text-foreground"
                tooltip={
                  references.length > 1
                    ? `${references.length} references selected`
                    : 'Reference selected'
                }
                tooltipPosition="top"
                ariaLabel="Open reference controls"
              >
                <span className="relative size-5 overflow-hidden rounded">
                  <Image
                    src={
                      referenceSource === 'brand'
                        ? `${EnvironmentService.cdnUrl}/references/${firstReference.id}`
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

            {!isMinimalBar && (
              <Button
                onClick={onToggleQuickOptions}
                variant={ButtonVariant.GHOST}
                className={cn(
                  iconButtonClass,
                  isQuickOptionsOpen && 'bg-hover text-foreground',
                )}
                tooltip={isQuickOptionsOpen ? 'Hide settings' : 'Show settings'}
                tooltipPosition="top"
                ariaLabel={
                  isQuickOptionsOpen ? 'Hide settings' : 'Show settings'
                }
                icon={<SlidersHorizontal className="size-4" />}
              />
            )}

            {!isMinimalBar && watchedTextTrimmed && (
              <Button
                onClick={() => handleCopy(form.getValues('text'))}
                isDisabled={isDisabledState}
                tooltip="Copy prompt"
                tooltipPosition="top"
                variant={ButtonVariant.GHOST}
                className={iconButtonClass}
                icon={<Clipboard className="size-4" />}
              />
            )}

            {!isMinimalBar && watchedTextTrimmed && (
              <Button
                onClick={enhancePrompt}
                isDisabled={isDisabledState || isEnhancing}
                tooltip={isEnhancing ? 'Enhancing…' : 'Enhance prompt with AI'}
                tooltipPosition="top"
                variant={ButtonVariant.GHOST}
                className={cn(iconButtonClass, isEnhancing && 'animate-pulse')}
                icon={<Sparkles className="size-4" />}
              />
            )}

            {!isMinimalBar && previousPrompt && (
              <Button
                onClick={handleUndo}
                isDisabled={isDisabledState}
                tooltip="Undo enhancement"
                tooltipPosition="top"
                variant={ButtonVariant.GHOST}
                className={iconButtonClass}
                icon={<Undo2 className="size-4" />}
              />
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {generationMeter ? (
              <PromptBarGenerationMeter meter={generationMeter} />
            ) : null}

            {!isMinimalBar && !isCollapsible && (
              <PromptOutputsButton
                form={form}
                getMinFromAllModels={getMinFromAllModels}
                getModelMaxOutputs={getModelMaxOutputs}
                isDisabledState={isDisabledState}
                triggerConfigChange={triggerConfigChange}
              />
            )}

            {!isMinimalBar && isCollapsible && (
              <>
                <PromptOutputsButton
                  form={form}
                  getMinFromAllModels={getMinFromAllModels}
                  getModelMaxOutputs={getModelMaxOutputs}
                  isDisabledState={isDisabledState}
                  triggerConfigChange={triggerConfigChange}
                />

                <PromptBarDivider className="h-5 bg-border" />
              </>
            )}

            {isSupported && (!isCollapsible || !watchedTextTrimmed) ? (
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
                icon={<Mic className="size-4" />}
              >
                {isCollapsible ? 'Voice' : null}
              </Button>
            ) : null}

            {isGenerating && onCancel ? (
              <Button
                variant={ButtonVariant.DESTRUCTIVE}
                icon={
                  <Square
                    aria-hidden
                    className="size-2.5 fill-current stroke-none"
                  />
                }
                onClick={onCancel}
                tooltip="Stop"
                tooltipPosition="top"
                ariaLabel="Stop generation"
                className={cn('transition-all duration-300', 'size-9 p-0')}
                data-testid="stop-generation-button"
              />
            ) : (
              <Button
                variant={ButtonVariant.DEFAULT}
                icon={<ArrowUp />}
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
                className={cn('transition-all duration-300', 'size-9 p-0')}
                data-testid="generate-button"
              />
            )}
          </div>
        </div>
      </div>

      {selectedModels.length > 0 && selectedModels.some((m) => m.trigger) && (
        <p className="text-xs text-foreground/60">
          Tip: Include trigger words:{' '}
          {selectedModels
            .reduce<string[]>((acc, m) => {
              if (m.trigger) acc.push(`"${m.trigger}"`);
              return acc;
            }, [])
            .join(', ')}
        </p>
      )}
    </div>
  );
});

export default PromptBarEssentials;
