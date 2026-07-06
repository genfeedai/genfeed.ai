'use client';

import { usePromptBarInternal } from '@genfeedai/contexts/ui/prompt-bar-internal-context';
import {
  DropdownDirection,
  IngredientCategory,
  ModelCategory,
  TagCategory,
} from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
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

const PromptBarExpandedView = memo(function PromptBarExpandedView() {
  const ctx = usePromptBarInternal();
  const isCollapsible = ctx.features.collapsible ?? true;
  const hasDragDrop = ctx.features.dragDrop ?? true;
  const [isQuickOptionsOpen, setIsQuickOptionsOpen] = useState(false);

  const handleQuickOptionsToggle = useCallback(
    () => setIsQuickOptionsOpen((value) => !value),
    [],
  );

  const inlineSettingsContent = useMemo(() => {
    const hasMetadataControls =
      ctx.currentConfig.buttons?.presets ||
      ctx.currentConfig.buttons?.scene ||
      ctx.currentConfig.buttons?.style ||
      ctx.currentConfig.buttons?.camera ||
      ctx.currentConfig.buttons?.mood ||
      ctx.currentConfig.buttons?.fontFamily;
    const hasTags = Boolean(ctx.currentConfig.buttons?.tags);
    const hasFolder = Boolean(ctx.folders?.length);

    if (!hasMetadataControls && !hasTags && !hasFolder) {
      return null;
    }

    return (
      <>
        <PromptBarFolderSelector
          folders={ctx.folders}
          form={ctx.form}
          controlClass={ctx.controlClass}
          isDisabled={ctx.isDisabledState}
          triggerDisplay="icon-only"
        />

        <PromptBarMetadataSelectors
          currentConfig={ctx.currentConfig}
          filteredPresets={ctx.filteredPresets}
          profiles={ctx.profiles ?? []}
          filteredScenes={ctx.filteredScenes}
          filteredFontFamilies={ctx.filteredFontFamilies}
          filteredStyles={ctx.filteredStyles}
          filteredCameras={ctx.filteredCameras}
          filteredLightings={ctx.filteredLightings}
          filteredLenses={ctx.filteredLenses}
          filteredCameraMovements={ctx.filteredCameraMovements}
          filteredMoods={ctx.filteredMoods}
          form={ctx.form}
          selectedPreset={ctx.selectedPreset}
          setSelectedPreset={ctx.setSelectedPreset}
          selectedProfile={ctx.selectedProfile}
          setSelectedProfile={ctx.setSelectedProfile}
          refocusTextarea={ctx.refocusTextarea}
          isDisabledState={ctx.isDisabledState}
          controlClass={ctx.controlClass}
          triggerDisplay="icon-only"
          onTextChange={ctx.onTextChange}
          triggerConfigChange={ctx.triggerConfigChange}
          onModelSelect={(modelKey) => {
            ctx.form.setValue('models', [modelKey], {
              shouldValidate: true,
            });
          }}
        />

        {hasTags && (
          <DropdownTags
            direction={DropdownDirection.UP}
            isDisabled={ctx.isDisabledState}
            className={ctx.controlClass}
            scope={TagCategory.INGREDIENT}
            showLabel={false}
            selectedTags={(ctx.form.getValues('tags') ?? []).filter(Boolean)}
            onChange={(tagIds) => {
              ctx.form.setValue('tags', tagIds, {
                shouldValidate: true,
              });
            }}
          />
        )}
      </>
    );
  }, [ctx]);

  const shouldShowSpeech = shouldShowSpeechInput(
    ctx.categoryType,
    ctx.hasSpeechValue,
  );
  const shouldShowQuickOptions = !isCollapsible
    ? shouldShowSpeech || isQuickOptionsOpen
    : isQuickOptionsOpen ||
      (ctx.categoryType === IngredientCategory.VIDEO &&
        Boolean(ctx.form.getValues('isBackgroundMusicEnabled')));

  const secondaryContent = useMemo(() => {
    if (!shouldShowSpeech && !shouldShowQuickOptions) {
      return undefined;
    }

    return (
      <div className="flex w-full flex-col gap-2">
        {shouldShowSpeech && (
          <PromptBarSpeechInput
            shouldRender={true}
            isAvatarRoute={ctx.categoryType === IngredientCategory.AVATAR}
            watchedSpeech={ctx.watchedSpeech}
            isDisabled={ctx.isDisabledState}
            charLimit={AVATAR_SPEECH_CHAR_LIMIT}
            onSpeechChange={(value) => {
              ctx.form.setValue('speech', value, { shouldValidate: true });
            }}
          />
        )}

        {shouldShowQuickOptions && (
          <PromptBarQuickOptions
            currentConfig={ctx.currentConfig}
            pathname={ctx.pathname}
            categoryType={ctx.categoryType}
            currentModelCategory={ctx.currentModelCategory}
            form={ctx.form}
            isDisabledState={ctx.isDisabledState}
            controlClass={ctx.controlClass}
            iconButtonClass={ctx.iconButtonClass}
            isAdvancedControlsEnabled={ctx.isAdvancedControlsEnabled}
            normalizedWatchedModels={ctx.normalizedWatchedModels}
            watchedFormat={ctx.watchedFormat}
            watchedWidth={ctx.watchedWidth}
            watchedHeight={ctx.watchedHeight}
            hasAudioToggleValue={ctx.hasAudioToggleValue}
            hasEndFrameValue={ctx.hasEndFrameValue}
            hasAnyImagenModelValue={ctx.hasAnyImagenModelValue}
            isOnlyImagenModelsValue={ctx.isOnlyImagenModelsValue}
            supportsInterpolation={ctx.supportsInterpolation}
            supportsMultipleReferences={ctx.supportsMultipleReferences}
            requiresReferences={ctx.requiresReferences}
            maxReferenceCount={ctx.maxReferenceCount}
            folders={ctx.folders}
            references={ctx.references}
            setReferences={ctx.setReferences}
            endFrame={ctx.endFrame}
            setEndFrame={ctx.setEndFrame}
            referenceSource={ctx.referenceSource}
            setReferenceSource={ctx.setReferenceSource}
            triggerConfigChange={ctx.triggerConfigChange}
            openGallery={ctx.openGallery}
            openUpload={ctx.openUpload}
            hasAnyResolutionOptionsValue={ctx.hasAnyResolutionOptionsValue}
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
    ctx,
    isQuickOptionsOpen,
    handleQuickOptionsToggle,
    inlineSettingsContent,
  ]);

  const dropLabel = useMemo(() => {
    if (ctx.currentModelCategory === ModelCategory.VIDEO) {
      return 'Drop image to attach as a start frame';
    }
    return 'Drop image to attach as a reference';
  }, [ctx.currentModelCategory]);

  const essentials = (
    <PromptBarEssentials
      currentConfig={ctx.currentConfig}
      pathname={ctx.pathname}
      categoryType={ctx.categoryType}
      currentModelCategory={ctx.currentModelCategory}
      features={ctx.features}
      form={ctx.form}
      isDisabledState={ctx.isDisabledState}
      isGenerateBlocked={ctx.isGenerateBlocked}
      controlClass={ctx.controlClass}
      iconButtonClass={ctx.iconButtonClass}
      isAdvancedMode={ctx.isAdvancedMode}
      isAdvancedControlsEnabled={ctx.isAdvancedControlsEnabled}
      isAutoMode={ctx.isAutoMode}
      setIsAutoMode={ctx.setIsAutoMode}
      models={ctx.models}
      trainings={ctx.trainings}
      selectedModels={ctx.selectedModels}
      trainingIds={ctx.trainingIds}
      normalizedWatchedModels={ctx.normalizedWatchedModels}
      watchedModels={ctx.watchedModels}
      watchedModel={ctx.watchedModel}
      watchedFormat={ctx.watchedFormat}
      watchedDuration={ctx.watchedDuration}
      watchedQuality={ctx.watchedQuality}
      subscriptionTier={ctx.subscriptionTier}
      isModelNotSet={ctx.isModelNotSet}
      hasModelWithoutDurationEditingValue={
        ctx.hasModelWithoutDurationEditingValue
      }
      formatIcon={ctx.formatIcon}
      videoDurations={ctx.videoDurations}
      references={ctx.references}
      referenceSource={ctx.referenceSource}
      setReferences={ctx.setReferences}
      setReferenceSource={ctx.setReferenceSource}
      folders={ctx.folders}
      triggerConfigChange={ctx.triggerConfigChange}
      handleTextareaChange={ctx.handleTextareaChange}
      onTextChange={ctx.onTextChange}
      onToggleQuickOptions={handleQuickOptionsToggle}
      isQuickOptionsOpen={isQuickOptionsOpen}
      handleCopy={ctx.handleCopy}
      enhancePrompt={ctx.enhancePrompt}
      handleUndo={ctx.handleUndo}
      handleSubmitForm={ctx.handleSubmitForm}
      suggestions={ctx.suggestions}
      onSuggestionSelect={ctx.onSuggestionSelect}
      showSuggestionsWhenEmpty={ctx.showSuggestionsWhenEmpty}
      maxSuggestions={ctx.maxSuggestions}
      onToggleCollapse={
        isCollapsible && ctx.setIsCollapsed
          ? () => ctx.setIsCollapsed?.(!ctx.isCollapsed)
          : undefined
      }
      secondaryContent={secondaryContent}
      textareaRef={ctx.textareaRef}
      textareaRegister={ctx.textareaRegister}
      modelDropdownRef={ctx.modelDropdownRef}
      promptBarHeight={ctx.promptBarHeight}
      getModelDefaultDuration={ctx.getModelDefaultDuration}
      getDefaultVideoResolution={ctx.getDefaultVideoResolution}
      getMinFromAllModels={ctx.getMinFromAllModels}
      getModelMaxOutputs={ctx.getModelMaxOutputs}
      setTextValue={ctx.setTextValue}
      isSupported={ctx.isSupported}
      toggleVoice={ctx.toggleVoice}
      isRecording={ctx.isRecording}
      isProcessing={ctx.isProcessing}
      isGenerating={ctx.isGenerating}
      isEnhancing={ctx.isEnhancing}
      isGenerateDisabled={ctx.isGenerateDisabled}
      previousPrompt={ctx.previousPrompt}
      selectedModelCost={ctx.selectedModelCost}
      activeGenerations={ctx.activeGenerations}
      generateLabel={ctx.generateLabel}
      avatars={ctx.avatars}
      voices={ctx.voices}
    />
  );

  const variationPresets = (
    <PromptBarVariationPresets
      shouldRender={
        ctx.references.length > 0 &&
        ctx.categoryType === IngredientCategory.IMAGE
      }
      form={ctx.form}
      setTextValue={ctx.setTextValue}
    />
  );

  if (!hasDragDrop) {
    return (
      <>
        {essentials}
        {variationPresets}
      </>
    );
  }

  return (
    <div
      className="relative"
      onDragEnter={ctx.onDragEnter}
      onDragLeave={ctx.onDragLeave}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDrop={ctx.onDropFiles}
      data-testid="promptbar-dropzone"
    >
      <div
        className={cn(
          'absolute inset-0 z-20 rounded-3xl border border-dashed border-primary/0 bg-primary/0 opacity-0 transition-all duration-200 pointer-events-none',
          ctx.isDragActive && 'border-primary/70 bg-primary/10 opacity-100',
        )}
      >
        <div className="flex h-full items-center justify-center">
          <div className="rounded-2xl border border-primary/30 bg-black/50 px-4 py-3 text-center backdrop-blur-sm">
            <p className="text-sm font-medium text-white">{dropLabel}</p>
            <p className="mt-1 text-xs text-white/60">
              Files upload to your library and attach to this prompt.
            </p>
          </div>
        </div>
      </div>

      {essentials}

      <PromptBarAttachedAssetsTray
        assets={ctx.attachedPromptAssets}
        dragError={ctx.dragError}
        isDisabled={ctx.isDisabledState}
        onBrowseAssets={ctx.onBrowseAssets ?? (() => {})}
        onRemoveAttachedAsset={ctx.onRemoveAttachedAsset ?? (() => {})}
      />

      {variationPresets}
    </div>
  );
});

export default PromptBarExpandedView;
