'use client';

import { isFlux3ImageModel } from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { canSubmitStudioGeneration } from '@genfeedai/services/core/desktop-runtime.service';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { useModelFavorites } from '@ui/dropdowns/model-selector/useModelFavorites';
import PromptBarAttachedAssetsTray from '@ui/prompt-bars/components/attached-assets-tray/PromptBarAttachedAssetsTray';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptBarReferenceControls from '@ui/prompt-bars/components/toolbar/PromptBarReferenceControls';
import PromptBarSendButton from '@ui/prompt-bars/components/toolbar/PromptBarSendButton';
import PromptBarSubmitSlot from '@ui/prompt-bars/components/toolbar/PromptBarSubmitSlot';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { useCallback } from 'react';
import GenerationSetupSectionChips from '@/features/studio/components/dropdowns/generation-setup/GenerationSetupSectionChips';
import GenerationSetupTypeBar from '@/features/studio/components/dropdowns/generation-setup/GenerationSetupTypeBar';
import PromptBarContextRow from '@/features/studio/components/prompt-bars/components/context-row/PromptBarContextRow';
import { useAdvancedModePreference } from '@/features/studio/hooks/use-advanced-mode-preference/use-advanced-mode-preference';
import StudioComposerImageControls from '@/features/studio/playground/components/StudioComposerImageControls';
import StudioComposerOutputControls from '@/features/studio/playground/components/StudioComposerOutputControls';
import StudioComposerReferenceNotice from '@/features/studio/playground/components/StudioComposerReferenceNotice';
import StudioGenerationSummary from '@/features/studio/playground/components/StudioGenerationSummary';
import StudioIdentityFields from '@/features/studio/playground/components/StudioIdentityFields';
import { useCrunInputControls } from '@/features/studio/playground/hooks/useCrunInputControls';
import { useStudioComposerNormalization } from '@/features/studio/playground/hooks/useStudioComposerNormalization';
import { useStudioComposerPresets } from '@/features/studio/playground/hooks/useStudioComposerPresets';
import { useStudioComposerPricing } from '@/features/studio/playground/hooks/useStudioComposerPricing';
import { useStudioComposerSetup } from '@/features/studio/playground/hooks/useStudioComposerSetup';
import { useStudioComposerSubmit } from '@/features/studio/playground/hooks/useStudioComposerSubmit';
import { useStudioSpendQuote } from '@/features/studio/playground/hooks/useStudioSpendQuote';
import { resolveStudioComposerValidation } from '@/features/studio/playground/utils/studio-composer-validation';
import {
  isStudioPlaygroundType,
  resolveStudioPlaygroundCapabilities,
} from '@/features/studio/playground/utils/studio-playground-types';
import { buildStudioReferenceSources } from '@/features/studio/playground/utils/studio-reference-sources';
import type { StudioPlaygroundComposerProps } from '@/features/studio/props/studio-playground.props';
import { useDesktopRuntimeContext } from '@/hooks/ui/use-desktop-runtime-context/use-desktop-runtime-context';

/** Types whose prompt is spoken aloud rather than described to a renderer. */
const SCRIPT_PLACEHOLDER = 'Write the script you want spoken…';
const PROMPT_PLACEHOLDER = 'Describe what you want to generate…';

/**
 * The single Studio composer. The asset type is state on this row rather than
 * a route segment, so switching Image → Video keeps the prompt and only swaps
 * the controls the new type actually supports.
 */
export default function StudioPlaygroundComposer({
  attachedAssets,
  contextGroups,
  crunQuote,
  isCrunRestoreBlocked = false,
  isPromptInvalid = false,
  crunReferenceCount,
  crunStartFrameId,
  crunEndFrameId,
  documentSeed,
  extraExtensions,
  isDragActive = false,
  isListening,
  isLoadingModels,
  isTranscribing,
  isUploading,
  isStopAvailable = false,
  isSubmitting = false,
  models,
  notice,
  onAddFiles,
  onOpenLibrary,
  onPromptChange,
  onPromptCommandContextChange,
  onPromptDocumentChange,
  onRemoveAttachedAsset,
  onResetSettings,
  onSettingsChange,
  onStartListening,
  onStopGeneration,
  onStopListening,
  onSubmit,
  onTypeChange,
  prompt,
  settings,
  isVoiceInputAvailable,
  type,
}: StudioPlaygroundComposerProps): ReactElement {
  const translate = useTranslations('pages.studioPlayground');
  const translateSetup = useTranslations('agent.generationSetup');
  const translateAssets = useTranslations('ui.promptBarAssets');
  const runtime = useDesktopRuntimeContext();
  const inputControls = useCrunInputControls(
    models,
    settings,
    crunReferenceCount ?? attachedAssets.length,
    onSettingsChange,
  );
  const isRuntimeBlocked = !canSubmitStudioGeneration(runtime);
  const { isQuoting, quoteSpend } = useStudioSpendQuote();
  // Narrowed against the selected model's own registry capability — the
  // static per-type config is only the widest case across every music
  // model (see `resolveStudioPlaygroundCapabilities`).
  const capabilities = resolveStudioPlaygroundCapabilities(
    type,
    settings.modelKey,
  );
  const isFlux = isFlux3ImageModel(settings.modelKey ?? '');
  const isAutoMode = settings.modelKey === AUTO_MODEL_OPTION_VALUE;
  const selectedModel = models.find((model) => model.key === settings.modelKey);
  const { droppedEditingControls } = useStudioComposerNormalization({
    attachedAssets,
    isFlux,
    onRemoveAttachedAsset,
    onSettingsChange,
    selectedModel,
    settings,
    type,
  });
  const { favoriteModelKeys, onFavoriteToggle } = useModelFavorites();
  // Advanced Mode only reveals manual model choice; Look, presets and
  // references stay available either way.
  const { isAdvancedMode, setAdvancedMode } = useAdvancedModePreference();
  const isModelChoiceVisible = capabilities.hasModelSelection && isAdvancedMode;
  // Auto: the user picks only the output type; routing picks the rest.
  const isAutoView = capabilities.hasModelSelection && !isAdvancedMode;
  const handleAdvancedModeChange = useCallback(
    (next: boolean) => {
      void setAdvancedMode(next);
      if (!next && settings.modelKey !== AUTO_MODEL_OPTION_VALUE) {
        onSettingsChange({ modelKey: AUTO_MODEL_OPTION_VALUE });
      }
    },
    [onSettingsChange, setAdvancedMode, settings.modelKey],
  );

  const isPromptEmpty = prompt.trim().length === 0;
  const validation = resolveStudioComposerValidation({
    attachedAssets,
    capabilities,
    inputMediaKind: inputControls?.mediaKind,
    isAutoMode,
    isLoadingModels,
    models,
    selectedModel,
    settings,
    type,
  });
  const pricing = useStudioComposerPricing({
    attachedAssets,
    capabilities,
    crunQuote,
    hasEditMask: validation.hasEditMask,
    isIdentityMissing: validation.isIdentityMissing,
    isLoadingModels,
    models,
    prompt,
    selectedModel,
    settings,
    type,
  });
  const { isDraftActive } = pricing;
  const isSubmitBlocked =
    isPromptInvalid ||
    isCrunRestoreBlocked ||
    pricing.isEstimateBlocking ||
    (selectedModel?.provider === 'crun' && !crunQuote?.getCurrentQuote()) ||
    validation.isEditSourceMissing ||
    validation.isEditingModelUnavailable ||
    isRuntimeBlocked ||
    isPromptEmpty ||
    validation.isIdentityMissing ||
    validation.isFirstFrameMissing ||
    validation.isAudioReferenceInvalid ||
    validation.isReferenceCombinationInvalid ||
    validation.isKling4KReferenceInvalid ||
    validation.isAwaitingModels ||
    isQuoting ||
    isListening ||
    isTranscribing ||
    isUploading;
  const guardedSubmit = useStudioComposerSubmit({
    buildQuoteRequest: pricing.buildQuoteRequest,
    draftSettings: pricing.draftSettings,
    isDraftActive,
    isSubmitBlocked,
    modelKey: settings.modelKey,
    models,
    onSubmit,
    quoteSpend,
    spendSource: pricing.spendSource,
  });

  const composerSetup = useStudioComposerSetup({
    capabilities,
    inputControls,
    modelKey: settings.modelKey,
    prompt,
    type,
  });
  const { contextRowGroups, handleApplySystemPresetById, systemPresetOptions } =
    useStudioComposerPresets({
      attachedAssets,
      composerSetup,
      contextGroups,
      isAutoMode,
      onPromptChange,
      onPromptCommandContextChange,
      prompt,
      selectedModel,
      settings,
      type,
    });

  const referenceSources = buildStudioReferenceSources({
    audioReferenceCount: validation.audioReferences.length,
    capabilities,
    editSourceCount: validation.editSources.length,
    editSourceLimit: validation.editSourceLimit,
    inputMediaKind: inputControls?.mediaKind,
    isAutoMode,
    isCrunStartEnd:
      inputControls?.mediaKind === 'video' &&
      inputControls.videoRules?.referenceMode === 'start-end',
    isFlux,
    isUploading,
    labels: {
      audioReference: translate('audioReference'),
      editMask: translate('editImage.maskOptional'),
      editSources: translate('editImage.sourceImages'),
      endFrame: translateAssets('endFrame'),
      reference: translateAssets('reference'),
      startFrame: translateAssets('startFrame'),
      videoReference: translateAssets('videoReference'),
    },
    modelKey: settings.modelKey,
    onAddFiles,
    onOpenLibrary,
    type,
  });

  // Model-specific controls live in the setup popover's Output section.
  const outputControls =
    inputControls?.mediaKind === 'image' ||
    (inputControls?.mediaKind === 'video' && settings.crunControls) ? (
      <StudioComposerOutputControls
        crunEndFrameId={crunEndFrameId}
        crunReferenceCount={crunReferenceCount}
        crunStartFrameId={crunStartFrameId}
        inputControls={inputControls}
        isUploading={isUploading}
        onSettingsChange={onSettingsChange}
        prompt={prompt}
        settings={settings}
      />
    ) : undefined;

  const identityFields = capabilities.hasIdentity ? (
    <StudioIdentityFields
      onChange={onSettingsChange}
      settings={settings}
      type={type}
    />
  ) : null;

  return (
    <PromptBarComposer
      banner={notice}
      beforeBody={
        <>
          {attachedAssets.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 px-3 pb-1 pt-3">
              <PromptBarAttachedAssetsTray
                assets={attachedAssets}
                translate={translateAssets}
                onRemoveAttachedAsset={onRemoveAttachedAsset}
              />
            </div>
          ) : null}
          <PromptBarContextRow
            ariaLabel={translate('composerContext.ariaLabel')}
            groups={contextRowGroups}
          />
        </>
      }
      className={cn(isDragActive && 'ring-1 ring-primary/40')}
      data-expanded="true"
      data-testid="studio-playground-composer-shell"
      density="compact"
    >
      <PromptEditor
        ariaLabel={translate('prompt')}
        className="min-h-6 min-w-0 w-full [&_.ProseMirror]:min-h-6"
        editorClassName="py-0.5"
        documentSeed={documentSeed}
        extraExtensions={extraExtensions}
        onDocumentChange={onPromptDocumentChange}
        onSubmit={() => {
          if (!isSubmitBlocked) {
            guardedSubmit();
          }
        }}
        onValueChange={onPromptChange}
        placeholder={
          isDragActive
            ? 'drop it here?'
            : type === 'image-edit'
              ? translate('editImage.promptPlaceholder')
              : capabilities.hasSpeech
                ? SCRIPT_PLACEHOLDER
                : PROMPT_PLACEHOLDER
        }
        testId="studio-playground-prompt"
        value={prompt}
      />

      <StudioComposerImageControls
        droppedEditingControls={droppedEditingControls}
        editSourceLimit={validation.editSourceLimit}
        editSources={validation.editSources}
        hasEditMask={validation.hasEditMask}
        isEditingModelUnavailable={validation.isEditingModelUnavailable}
        isEditSourceMissing={validation.isEditSourceMissing}
        isFlux={isFlux}
        onSettingsChange={onSettingsChange}
        settings={settings}
        type={type}
      />
      <StudioComposerReferenceNotice
        isAudioReferenceInvalid={validation.isAudioReferenceInvalid}
        isFirstFrameMissing={validation.isFirstFrameMissing}
        isKling4KReferenceInvalid={validation.isKling4KReferenceInvalid}
        isReferenceCombinationInvalid={validation.isReferenceCombinationInvalid}
      />
      <PromptBarToolbar
        leadingLabel={translateSetup('promptTools')}
        trailingLabel={translateSetup('generationControls')}
        mode={
          <GenerationSetupTypeBar
            // Every type keeps the Auto/Advanced button; Avatar just has no
            // model to choose in Advanced.
            advancedMode={{
              isEnabled: isAdvancedMode,
              onChange: handleAdvancedModeChange,
            }}
            // Editing is a mode of Image, not a type of its own.
            imageEditing={{
              isEnabled: type === 'image-edit',
              onChange: (isEditing) =>
                onTypeChange(isEditing ? 'image-edit' : 'image'),
            }}
            onTypeChange={(nextType) => {
              // The shared bar speaks GenerationSetupType; Studio only offers
              // its own registry, so anything else is not a Studio pick.
              if (isStudioPlaygroundType(nextType)) {
                onTypeChange(nextType);
              }
            }}
            setup={composerSetup.setupForComposer}
            typeOptions={composerSetup.typeOptions}
            videoDraft={
              pricing.draftSettings
                ? {
                    credits:
                      pricing.draftEstimate.status === 'estimated'
                        ? pricing.draftEstimate.credits
                        : null,
                    isEnabled: isDraftActive,
                    onChange: pricing.setIsDraftMode,
                  }
                : undefined
            }
          />
        }
        leading={
          isAdvancedMode ? (
            <GenerationSetupSectionChips
              // Model follows the mode button; the identity pickers come
              // next, then Output, Look, Brand and Presets.
              afterModel={identityFields}
              capabilities={capabilities}
              favoriteModelKeys={favoriteModelKeys}
              inputControls={inputControls}
              isPresetsLoading={composerSetup.isPresetsLoading}
              lookOptions={composerSetup.lookOptions}
              models={isModelChoiceVisible ? models : []}
              onApplyPreset={composerSetup.handleApplyPreset}
              onApplySystemPreset={handleApplySystemPresetById}
              onClearPreset={composerSetup.handleClearPreset}
              onDeletePreset={composerSetup.handleDeletePreset}
              onFavoriteToggle={onFavoriteToggle}
              onResetAll={onResetSettings}
              onResetField={composerSetup.handleResetField}
              onSavePreset={composerSetup.handleSavePreset}
              onSetField={composerSetup.handleSetField}
              outputControls={outputControls}
              presets={composerSetup.presets}
              referenceCount={crunReferenceCount ?? attachedAssets.length}
              showEnhancementSettings={type === 'image' || type === 'video'}
              showPresets={type === 'image' || type === 'video'}
              systemPresets={systemPresetOptions}
              reasons={composerSetup.reasons}
              setup={composerSetup.setupForComposer}
              typeOptions={composerSetup.typeOptions}
            />
          ) : (
            identityFields
          )
        }
        reference={
          <>
            {referenceSources.length > 0 ? (
              <PromptBarReferenceControls isChip sources={referenceSources} />
            ) : null}
          </>
        }
        trailing={
          <PromptBarSubmitSlot
            isEmpty={isPromptEmpty}
            isListening={isListening}
            isTranscribing={isTranscribing}
            isVoiceAvailable={isVoiceInputAvailable}
            onStartListening={onStartListening}
            onStop={
              onStopGeneration
                ? () => {
                    void onStopGeneration();
                  }
                : undefined
            }
            onStopListening={onStopListening}
            showStop={isStopAvailable && !isSubmitting}
            stopLabel={translate('stopGeneration')}
            // Nothing left to send while a run generates: Stop is the control.
            send={
              isStopAvailable && isPromptEmpty && !isSubmitting ? null : (
                <StudioGenerationSummary
                  crunQuote={crunQuote}
                  estimate={
                    isDraftActive ? pricing.draftEstimate : pricing.estimate
                  }
                  // Music Auto is one catalog default with a tariff, and an
                  // avatar quote resolves its Auto engine on the server, so
                  // both stay visible. Image and video Auto hide it.
                  isEstimateHidden={
                    !isDraftActive &&
                    isAutoView &&
                    type !== 'music' &&
                    type !== 'avatar'
                  }
                  model={selectedModel}
                  onOpen={pricing.refreshRetryCreditBack}
                  retryCreditBackCredits={pricing.retryCreditBackCredits}
                  type={type}
                  label={translate('generate')}
                >
                  <PromptBarSendButton
                    ariaLabel={translate('generate')}
                    className={
                      isSubmitBlocked
                        ? 'cursor-not-allowed opacity-50'
                        : undefined
                    }
                    isAriaDisabled={isSubmitBlocked}
                    isLoading={isQuoting || isSubmitting}
                    onClick={guardedSubmit}
                  />
                </StudioGenerationSummary>
              )
            }
          />
        }
      />
    </PromptBarComposer>
  );
}
