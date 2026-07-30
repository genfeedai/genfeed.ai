'use client';

import { PromptBarInternalContext } from '@genfeedai/contexts/ui/prompt-bar-internal-context';
import { IngredientCategory, IngredientFormat } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptBarProps } from '@genfeedai/props/studio/prompt-bar.props';
import PromptBarCollapsedView from '@ui/prompt-bars/components/collapsed-view/PromptBarCollapsedView';
import PromptBarExpandedView from '@ui/prompt-bars/components/expanded-view/PromptBarExpandedView';
import PromptBarShell, {
  PROMPT_BAR_SURFACE_CLASS,
} from '@ui/prompt-bars/components/shell/PromptBarShell';
import { memo } from 'react';
import { EMPTY_ARRAY, getAspectRatioFromFormat } from './prompt-bar.helpers';
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
    push,
    buildHref,
    watchedFormat,
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
              'sticky bottom-0 z-50 flex-shrink-0 transition-all duration-300',
              isCollapsed ? 'overflow-hidden' : 'overflow-visible',
            )}
          >
            <PromptBarShell
              banner={banner}
              className={PROMPT_BAR_SURFACE_CLASS}
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
                  onSubmit={handleSubmitForm}
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
                  onCreateVariation={
                    categoryType === IngredientCategory.IMAGE
                      ? (reference) => {
                          if (!reference) {
                            return;
                          }
                          const format =
                            watchedFormat || IngredientFormat.PORTRAIT;
                          push(
                            buildHref(
                              `/studio/image?referenceImageId=${reference.id}&format=${format}`,
                            ),
                          );
                        }
                      : undefined
                  }
                  onFormatChange={
                    categoryType === IngredientCategory.IMAGE ||
                    categoryType === IngredientCategory.VIDEO
                      ? (nextFormat) => {
                          if (categoryType === IngredientCategory.IMAGE) {
                            push(
                              buildHref(`/studio/image?format=${nextFormat}`),
                            );
                          } else if (
                            categoryType === IngredientCategory.VIDEO
                          ) {
                            const aspectRatio =
                              getAspectRatioFromFormat(nextFormat);
                            push(
                              buildHref(
                                `/studio/video?aspectRatio=${aspectRatio}`,
                              ),
                            );
                          }
                        }
                      : undefined
                  }
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
            </PromptBarShell>
          </div>
        </form>
      </div>
    </PromptBarInternalContext.Provider>
  );
}

export default memo(PromptBar);
