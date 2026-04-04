'use client';

import {
  DropdownDirection,
  IngredientCategory,
  ModelCategory,
  TagCategory,
} from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { PromptBarExpandedViewProps } from '@props/studio/prompt-bar.props';
import PromptBarAttachedAssetsTray from '@ui/prompt-bars/components/attached-assets-tray/PromptBarAttachedAssetsTray';
import PromptBarEssentials from '@ui/prompt-bars/components/essentials/PromptBarEssentials';
import PromptBarFolderSelector from '@ui/prompt-bars/components/folder-selector/PromptBarFolderSelector';
import PromptBarMetadataSelectors from '@ui/prompt-bars/components/metadata-selectors/PromptBarMetadataSelectors';
import PromptBarQuickOptions from '@ui/prompt-bars/components/quick-options/PromptBarQuickOptions';
import PromptBarSpeechInput from '@ui/prompt-bars/components/speech-input/PromptBarSpeechInput';
import PromptBarVariationPresets from '@ui/prompt-bars/components/variation-presets/PromptBarVariationPresets';
import DropdownTags from '@ui/tags/dropdown/DropdownTags';
import { memo, useCallback, useMemo, useState } from 'react';

const AVATAR_SPEECH_CHAR_LIMIT = 100;

function shouldShowSpeechInput(
  categoryType: IngredientCategory | undefined,
  hasSpeechValue: boolean,
): boolean {
  if (categoryType === IngredientCategory.AVATAR) {
    return true;
  }
  return categoryType === IngredientCategory.VIDEO && hasSpeechValue;
}

const PromptBarExpandedView = memo(function PromptBarExpandedView({
  currentConfig,
  pathname,
  categoryType,
  currentModelCategory,
  form,
  isCollapsed,
  setIsCollapsed,
  isAutoMode,
  setIsAutoMode,
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
  watchedWidth,
  watchedHeight,
  watchedDuration,
  watchedSpeech,
  watchedQuality,
  subscriptionTier,
  isModelNotSet,
  hasAudioToggleValue,
  hasSpeechValue,
  hasModelWithoutDurationEditingValue,
  hasAnyResolutionOptionsValue,
  hasEndFrameValue,
  hasAnyImagenModelValue,
  isOnlyImagenModelsValue,
  supportsInterpolation,
  supportsMultipleReferences,
  requiresReferences,
  maxReferenceCount,
  folders,
  profiles,
  filteredPresets,
  filteredScenes,
  filteredFontFamilies,
  filteredStyles,
  filteredCameras,
  filteredLightings,
  filteredLenses,
  filteredCameraMovements,
  filteredMoods,
  references,
  setReferences,
  endFrame,
  setEndFrame,
  referenceSource,
  setReferenceSource,
  selectedPreset,
  setSelectedPreset,
  selectedProfile,
  setSelectedProfile,
  formatIcon,
  videoDurations,
  triggerConfigChange,
  refocusTextarea,
  handleTextareaChange,
  onTextChange,
  handleCopy,
  enhancePrompt,
  handleUndo,
  handleSubmitForm,
  suggestions,
  onSuggestionSelect,
  showSuggestionsWhenEmpty,
  maxSuggestions,
  openGallery,
  openUpload,
  isDragActive = false,
  dragError = null,
  attachedPromptAssets = [],
  onDragEnter = () => {},
  onDragLeave = () => {},
  onDropFiles = async () => {},
  onRemoveAttachedAsset = () => {},
  onBrowseAssets = () => {},
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
  selectedModelCost,
  activeGenerations,
  generateLabel,
  avatars = [],
  voices = [],
}: PromptBarExpandedViewProps) {
  const [isQuickOptionsOpen, setIsQuickOptionsOpen] = useState(false);

  const handleQuickOptionsToggle = useCallback(
    () => setIsQuickOptionsOpen((value) => !value),
    [],
  );

  const inlineSettingsContent = useMemo(() => {
    const hasMetadataControls =
      currentConfig.buttons?.presets ||
      currentConfig.buttons?.scene ||
      currentConfig.buttons?.style ||
      currentConfig.buttons?.camera ||
      currentConfig.buttons?.mood ||
      currentConfig.buttons?.fontFamily;
    const hasTags = Boolean(currentConfig.buttons?.tags);
    const hasFolder = Boolean(folders?.length);

    if (!hasMetadataControls && !hasTags && !hasFolder) {
      return null;
    }

    return (
      <>
        <PromptBarFolderSelector
          folders={folders}
          form={form}
          controlClass={controlClass}
          isDisabled={isDisabledState}
          triggerDisplay="icon-only"
        />

        <PromptBarMetadataSelectors
          currentConfig={currentConfig}
          filteredPresets={filteredPresets}
          profiles={profiles ?? []}
          filteredScenes={filteredScenes}
          filteredFontFamilies={filteredFontFamilies}
          filteredStyles={filteredStyles}
          filteredCameras={filteredCameras}
          filteredLightings={filteredLightings}
          filteredLenses={filteredLenses}
          filteredCameraMovements={filteredCameraMovements}
          filteredMoods={filteredMoods}
          form={form}
          selectedPreset={selectedPreset}
          setSelectedPreset={setSelectedPreset}
          selectedProfile={selectedProfile}
          setSelectedProfile={setSelectedProfile}
          refocusTextarea={refocusTextarea}
          isDisabledState={isDisabledState}
          controlClass={controlClass}
          triggerDisplay="icon-only"
          onTextChange={onTextChange}
          triggerConfigChange={triggerConfigChange}
          onModelSelect={(modelKey) => {
            form.setValue('models', [modelKey], {
              shouldValidate: true,
            });
          }}
        />

        {hasTags && (
          <DropdownTags
            direction={DropdownDirection.UP}
            isDisabled={isDisabledState}
            className={controlClass}
            scope={TagCategory.INGREDIENT}
            showLabel={false}
            selectedTags={(form.getValues('tags') ?? []).filter(Boolean)}
            onChange={(tagIds) => {
              form.setValue('tags', tagIds, {
                shouldValidate: true,
              });
            }}
          />
        )}
      </>
    );
  }, [
    currentConfig,
    folders,
    form,
    controlClass,
    isDisabledState,
    filteredPresets,
    profiles,
    filteredScenes,
    filteredFontFamilies,
    filteredStyles,
    filteredCameras,
    filteredLightings,
    filteredLenses,
    filteredCameraMovements,
    filteredMoods,
    selectedPreset,
    setSelectedPreset,
    selectedProfile,
    setSelectedProfile,
    refocusTextarea,
    onTextChange,
    triggerConfigChange,
  ]);

  const shouldShowSpeech = shouldShowSpeechInput(categoryType, hasSpeechValue);
  const shouldShowQuickOptions =
    isQuickOptionsOpen ||
    (categoryType === IngredientCategory.VIDEO &&
      Boolean(form.getValues('isBackgroundMusicEnabled')));

  const secondaryContent = useMemo(() => {
    if (!shouldShowSpeech && !shouldShowQuickOptions) {
      return undefined;
    }

    return (
      <div className="flex w-full flex-col gap-2">
        {shouldShowSpeech && (
          <PromptBarSpeechInput
            shouldRender={true}
            isAvatarRoute={categoryType === IngredientCategory.AVATAR}
            watchedSpeech={watchedSpeech}
            isDisabled={isDisabledState}
            charLimit={AVATAR_SPEECH_CHAR_LIMIT}
            onSpeechChange={(value) => {
              form.setValue('speech', value, { shouldValidate: true });
            }}
          />
        )}

        {shouldShowQuickOptions && (
          <PromptBarQuickOptions
            currentConfig={currentConfig}
            pathname={pathname}
            categoryType={categoryType}
            currentModelCategory={currentModelCategory}
            form={form}
            isDisabledState={isDisabledState}
            controlClass={controlClass}
            iconButtonClass={iconButtonClass}
            isAdvancedControlsEnabled={isAdvancedControlsEnabled}
            normalizedWatchedModels={normalizedWatchedModels}
            watchedFormat={watchedFormat}
            watchedWidth={watchedWidth}
            watchedHeight={watchedHeight}
            hasAudioToggleValue={hasAudioToggleValue}
            hasEndFrameValue={hasEndFrameValue}
            hasAnyImagenModelValue={hasAnyImagenModelValue}
            isOnlyImagenModelsValue={isOnlyImagenModelsValue}
            supportsInterpolation={supportsInterpolation}
            supportsMultipleReferences={supportsMultipleReferences}
            requiresReferences={requiresReferences}
            maxReferenceCount={maxReferenceCount}
            folders={folders}
            references={references}
            setReferences={setReferences}
            endFrame={endFrame}
            setEndFrame={setEndFrame}
            referenceSource={referenceSource}
            setReferenceSource={setReferenceSource}
            triggerConfigChange={triggerConfigChange}
            openGallery={openGallery}
            openUpload={openUpload}
            hasAnyResolutionOptionsValue={hasAnyResolutionOptionsValue}
            isExpanded={isQuickOptionsOpen}
            onToggleExpanded={handleQuickOptionsToggle}
            showToggle={false}
            inlineContent={inlineSettingsContent}
          />
        )}
      </div>
    );
  }, [
    shouldShowSpeech,
    shouldShowQuickOptions,
    categoryType,
    watchedSpeech,
    isDisabledState,
    form,
    currentConfig,
    pathname,
    currentModelCategory,
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
    folders,
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
    isQuickOptionsOpen,
    handleQuickOptionsToggle,
    inlineSettingsContent,
  ]);

  const dropLabel = useMemo(() => {
    if (currentModelCategory === ModelCategory.VIDEO) {
      return 'Drop image to attach as a start frame';
    }

    return 'Drop image to attach as a reference';
  }, [currentModelCategory]);

  return (
    <div
      className="relative"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDrop={onDropFiles}
      data-testid="promptbar-dropzone"
    >
      <div
        className={cn(
          'absolute inset-0 z-20 rounded-3xl border border-dashed border-primary/0 bg-primary/0 opacity-0 transition-all duration-200 pointer-events-none',
          isDragActive && 'border-primary/70 bg-primary/10 opacity-100',
        )}
      >
        <div className="flex h-full items-center justify-center">
          <div className="rounded-2xl border border-primary/30 bg-black/50 px-4 py-3 text-center shadow-lg backdrop-blur-sm">
            <p className="text-sm font-medium text-white">{dropLabel}</p>
            <p className="mt-1 text-xs text-white/60">
              Files upload to your library and attach to this prompt.
            </p>
          </div>
        </div>
      </div>

      <PromptBarEssentials
        currentConfig={currentConfig}
        pathname={pathname}
        categoryType={categoryType}
        currentModelCategory={currentModelCategory}
        shellMode="legacy-collapsible"
        form={form}
        isDisabledState={isDisabledState}
        isGenerateBlocked={isGenerateBlocked}
        controlClass={controlClass}
        iconButtonClass={iconButtonClass}
        isAdvancedMode={isAdvancedMode}
        isAdvancedControlsEnabled={isAdvancedControlsEnabled}
        isAutoMode={isAutoMode}
        setIsAutoMode={setIsAutoMode}
        models={models}
        trainings={trainings}
        selectedModels={selectedModels}
        trainingIds={trainingIds}
        normalizedWatchedModels={normalizedWatchedModels}
        watchedModels={watchedModels}
        watchedModel={watchedModel}
        watchedFormat={watchedFormat}
        watchedDuration={watchedDuration}
        watchedQuality={watchedQuality}
        subscriptionTier={subscriptionTier}
        isModelNotSet={isModelNotSet}
        hasModelWithoutDurationEditingValue={
          hasModelWithoutDurationEditingValue
        }
        formatIcon={formatIcon}
        videoDurations={videoDurations}
        references={references}
        referenceSource={referenceSource}
        setReferences={setReferences}
        setReferenceSource={setReferenceSource}
        folders={folders}
        triggerConfigChange={triggerConfigChange}
        handleTextareaChange={handleTextareaChange}
        onTextChange={onTextChange}
        onToggleQuickOptions={handleQuickOptionsToggle}
        isQuickOptionsOpen={isQuickOptionsOpen}
        handleCopy={handleCopy}
        enhancePrompt={enhancePrompt}
        handleUndo={handleUndo}
        handleSubmitForm={handleSubmitForm}
        suggestions={suggestions}
        onSuggestionSelect={onSuggestionSelect}
        showSuggestionsWhenEmpty={showSuggestionsWhenEmpty}
        maxSuggestions={maxSuggestions}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        secondaryContent={secondaryContent}
        textareaRef={textareaRef}
        textareaRegister={textareaRegister}
        modelDropdownRef={modelDropdownRef}
        promptBarHeight={promptBarHeight}
        getModelDefaultDuration={getModelDefaultDuration}
        getDefaultVideoResolution={getDefaultVideoResolution}
        getMinFromAllModels={getMinFromAllModels}
        getModelMaxOutputs={getModelMaxOutputs}
        setTextValue={setTextValue}
        isSupported={isSupported}
        toggleVoice={toggleVoice}
        isRecording={isRecording}
        isProcessing={isProcessing}
        isGenerating={isGenerating}
        isEnhancing={isEnhancing}
        isGenerateDisabled={isGenerateDisabled}
        previousPrompt={previousPrompt}
        selectedModelCost={selectedModelCost}
        activeGenerations={activeGenerations}
        generateLabel={generateLabel}
        avatars={avatars}
        voices={voices}
      />

      <PromptBarAttachedAssetsTray
        assets={attachedPromptAssets}
        dragError={dragError}
        isDisabled={isDisabledState}
        onBrowseAssets={onBrowseAssets}
        onRemoveAttachedAsset={onRemoveAttachedAsset}
      />

      <PromptBarVariationPresets
        shouldRender={
          references.length > 0 && categoryType === IngredientCategory.IMAGE
        }
        form={form}
        setTextValue={setTextValue}
      />
    </div>
  );
});

export default PromptBarExpandedView;
