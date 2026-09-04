'use client';

import { PromptBarInternalContext } from '@genfeedai/contexts/ui/prompt-bar-internal-context';
import { IngredientCategory } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptBarProps } from '@genfeedai/props/studio/prompt-bar.props';
import PromptBarCollapsedView from '@ui/prompt-bars/components/collapsed-view/PromptBarCollapsedView';
import PromptBarExpandedView from '@ui/prompt-bars/components/expanded-view/PromptBarExpandedView';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import { memo } from 'react';
import { EMPTY_ARRAY } from './prompt-bar.helpers';
import { usePromptBarState } from './use-prompt-bar-state';

function PromptBar({
  isDisabled = false,
  models = EMPTY_ARRAY,
  trainings = EMPTY_ARRAY,
  presets = EMPTY_ARRAY,
  folders = EMPTY_ARRAY,
  profiles = EMPTY_ARRAY,
  moods = EMPTY_ARRAY,
  styles = EMPTY_ARRAY,
  cameras = EMPTY_ARRAY,
  scenes = EMPTY_ARRAY,
  fontFamilies = EMPTY_ARRAY,
  blacklists = EMPTY_ARRAY,
  sounds = EMPTY_ARRAY,
  lightings = EMPTY_ARRAY,
  lenses = EMPTY_ARRAY,
  cameraMovements = EMPTY_ARRAY,
  avatars = EMPTY_ARRAY,
  voices = EMPTY_ARRAY,
  categoryType,
  onDatasetChange = () => {},
  onSubmit,
  onCancel,
  isGenerating = false,
  isGenerateDisabled = false,
  requiresModelSelection = true,
  generateLabel = 'Generate',
  externalFormat,
  externalWidth,
  externalHeight,
  promptData,
  promptText,
  onTextChange,
  promptConfig,
  onConfigChange,
  features = {},
  suggestions,
  onSuggestionSelect,
  showSuggestionsWhenEmpty = true,
  maxSuggestions = 3,
  extraExtensions,
  onPromptDocumentChange,
  onPrepareSubmit,
  banner,
}: PromptBarProps) {
  const {
    internalContextValue,
    promptBarRef,
    collapsedInputRef,
    isInternalUpdateRef,
    isCollapsed,
    setIsCollapsed,
    isCollapsible,
    form,
    currentConfig,
    isDisabledState,
    isGenerateBlocked,
    selectedModelCost,
    generationMeter,
    handleSubmitForm,
    activeGenerations,
    handleTextChange,
    watchedModel,
    formatIcon,
    references,
    referenceSource,
    triggerConfigChange,
    currentModelCategory,
    settings,
    isSupported,
    toggleVoice,
    isRecording,
    isProcessing,
  } = usePromptBarState({
    isDisabled,
    models,
    trainings,
    presets,
    folders,
    profiles,
    moods,
    styles,
    cameras,
    scenes,
    fontFamilies,
    blacklists,
    sounds,
    lightings,
    lenses,
    cameraMovements,
    avatars,
    voices,
    categoryType,
    onDatasetChange,
    onSubmit,
    onCancel,
    isGenerating,
    isGenerateDisabled,
    requiresModelSelection,
    generateLabel,
    externalFormat,
    externalWidth,
    externalHeight,
    promptData,
    promptText,
    onTextChange,
    promptConfig,
    onConfigChange,
    features,
    suggestions,
    onSuggestionSelect,
    showSuggestionsWhenEmpty,
    maxSuggestions,
    extraExtensions,
    onPromptDocumentChange,
    onPrepareSubmit,
  });

  return (
    <PromptBarInternalContext.Provider value={internalContextValue}>
      <div className="relative flex size-full min-h-0 flex-col">
        <form
          onSubmit={handleSubmitForm}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div
            ref={promptBarRef}
            className={cn(
              'relative flex-shrink-0 transition-[height] duration-300',
              isCollapsed ? 'overflow-hidden' : 'overflow-visible',
            )}
          >
            <PromptBarComposer
              banner={banner}
              bodyClassName="p-0"
              data-testid="studio-prompt-bar-shell"
            >
              {isCollapsed && isCollapsible ? (
                <PromptBarCollapsedView
                  collapsedInputRef={collapsedInputRef}
                  form={form}
                  placeholder={currentConfig.placeholder}
                  isDisabled={isDisabledState}
                  isGenerateBlocked={isGenerateBlocked}
                  isGenerateDisabled={isGenerateDisabled}
                  isGenerating={isGenerating}
                  selectedModelCost={selectedModelCost}
                  generationMeter={generationMeter}
                  onSubmit={handleSubmitForm}
                  onCancel={onCancel}
                  generateLabel={generateLabel}
                  activeGenerationsCount={activeGenerations.length}
                  onExpand={() => setIsCollapsed(false)}
                  isFormValid={form.formState.isValid}
                  isInternalUpdateRef={isInternalUpdateRef}
                  onTextChange={handleTextChange}
                  watchedModel={watchedModel}
                  formatIcon={formatIcon}
                  references={references}
                  referenceSource={referenceSource}
                  outputs={form.watch('outputs') || 1}
                  onOutputsChange={(count) => {
                    form.setValue('outputs', count, { shouldValidate: true });
                    triggerConfigChange();
                  }}
                  categoryType={categoryType}
                  currentModelCategory={currentModelCategory}
                  // The collapsed format cycle used to navigate to the
                  // standalone Studio generate route. That surface is retired,
                  // so the format now changes in place on the active prompt bar.
                  onFormatChange={
                    categoryType === IngredientCategory.IMAGE ||
                    categoryType === IngredientCategory.VIDEO
                      ? (nextFormat) => {
                          form.setValue('format', nextFormat, {
                            shouldValidate: true,
                          });
                          triggerConfigChange();
                        }
                      : undefined
                  }
                  extraExtensions={extraExtensions}
                  onDocumentChange={internalContextValue.onDocumentChange}
                  isSupported={
                    isSupported && settings?.isVoiceControlEnabled !== false
                  }
                  toggleVoice={toggleVoice}
                  isRecording={isRecording}
                  isProcessing={isProcessing}
                />
              ) : (
                <PromptBarExpandedView />
              )}
            </PromptBarComposer>
          </div>
        </form>
      </div>
    </PromptBarInternalContext.Provider>
  );
}

export default memo(PromptBar);
