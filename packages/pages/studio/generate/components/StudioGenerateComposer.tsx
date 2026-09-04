'use client';

import {
  ButtonSize,
  ButtonVariant,
  type RouterPriority,
} from '@genfeedai/contracts';
import {
  hasEndFrame,
  hasVideoReferences,
  MODEL_KEYS,
  requiresFirstFrame,
} from '@genfeedai/contracts/constants';
import type { IStudioLook } from '@genfeedai/contracts/interfaces';
import type {
  GenerationSetupFieldKey,
  GenerationSetupValues,
} from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { getDefaultVideoResolution } from '@genfeedai/helpers/media/video-resolution/video-resolution.helper';
import { quoteVideoGenerationCredits } from '@genfeedai/pricing';
import type { StudioGenerateComposerProps } from '@genfeedai/props/studio/studio-generate.props';
import { useDebounce } from '@hooks/utils/use-debounce/use-debounce';
import StudioGenerateSettingsPopover from '@pages/studio/generate/components/StudioGenerateSettingsPopover';
import StudioIdentityFields from '@pages/studio/generate/components/StudioIdentityFields';
import { useStudioGenerationSetupLookOptions } from '@pages/studio/generate/hooks/useStudioGenerationSetupLookOptions';
import {
  presetToGenerationSetupValues,
  useStudioLooks,
} from '@pages/studio/generate/hooks/useStudioLooks';
import { useStudioRemixRunScope } from '@pages/studio/generate/StudioRemixRunScope';
import {
  getStudioGenerateTypeConfig,
  listStudioGenerateTypeConfigs,
} from '@pages/studio/generate/utils/studio-generate-types';
import { getDefaultGenerationSetupValues } from '@pages/studio/generate/utils/studio-generation-setup-bridge';
import GenerationSetupPopover from '@ui/dropdowns/generation-setup/GenerationSetupPopover';
import { recommendGenerationSetup } from '@ui/dropdowns/generation-setup/generation-setup.recommend';
import {
  applyGenerationSetupPreset,
  applyGenerationSetupRecommendation,
  buildStudioGenerationSetupScope,
  clearGenerationSetupPreset,
  resetGenerationSetupField,
  setGenerationSetupField,
  useGenerationSetupStore,
} from '@ui/dropdowns/generation-setup/generation-setup.store';
import ModelSelectorPopover from '@ui/dropdowns/model-selector/ModelSelectorPopover';
import {
  AUTO_MODEL_OPTION_VALUE,
  AUTO_PRIORITY_LABELS,
} from '@ui/dropdowns/model-selector/model-selector.constants';
import { useModelFavorites } from '@ui/dropdowns/model-selector/useModelFavorites';
import { Button } from '@ui/primitives/button';
import PromptBarAttachedAssetsTray from '@ui/prompt-bars/components/attached-assets-tray/PromptBarAttachedAssetsTray';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptBarReferenceControls from '@ui/prompt-bars/components/toolbar/PromptBarReferenceControls';
import PromptBarVoiceControl from '@ui/prompt-bars/components/toolbar/PromptBarVoiceControl';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import { ArrowUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { useCallback, useEffect } from 'react';

/** Types whose prompt is spoken aloud rather than described to a renderer. */
const SCRIPT_PLACEHOLDER = 'Write the script you want spoken…';
const PROMPT_PLACEHOLDER = 'Describe what you want to generate…';

/** Debounce window before a prompt edit re-runs the recommendation engine. */
const RECOMMENDATION_DEBOUNCE_MS = 400;

/**
 * The single Studio composer. The asset type is state on this row rather than
 * a route segment, so switching Image → Video keeps the prompt and only swaps
 * the controls the new type actually supports.
 */
export default function StudioGenerateComposer({
  attachedAssets,
  extraExtensions,
  isDragActive = false,
  isGenerating,
  isListening,
  isLoadingModels,
  isTranscribing,
  isUploading,
  models,
  onAddFiles,
  onOpenLibrary,
  onPromptChange,
  onPromptDocumentChange,
  onRemoveAttachedAsset,
  onResetSettings,
  onSettingsChange,
  onStartListening,
  onStopListening,
  onSubmit,
  onTypeChange,
  prompt,
  settings,
  shouldShowVoiceInput,
  type,
}: StudioGenerateComposerProps): ReactElement {
  const translate = useTranslations('pages.studioGenerate');
  const { capabilities } = getStudioGenerateTypeConfig(type);
  const { favoriteModelKeys, onFavoriteToggle } = useModelFavorites();

  const isPromptEmpty = prompt.trim().length === 0;
  const isAutoMode = settings.modelKey === AUTO_MODEL_OPTION_VALUE;
  const selectedModel = models.find((model) => model.key === settings.modelKey);
  const isFirstFrameMissing =
    type === 'video' &&
    !isAutoMode &&
    requiresFirstFrame(settings.modelKey) &&
    !attachedAssets.some((asset) => asset.role === 'startFrame');
  const isReferenceCombinationInvalid =
    type === 'video' &&
    settings.modelKey === MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5 &&
    attachedAssets.some((asset) => asset.role === 'videoReference') &&
    attachedAssets.some(
      (asset) => asset.role === 'startFrame' || asset.role === 'endFrame',
    );
  const isKling4KReferenceInvalid =
    type === 'video' &&
    settings.modelKey === MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO &&
    settings.resolution === '4k' &&
    attachedAssets.some((asset) => asset.role === 'videoReference');
  // Submitting mid-catalog-load would resolve the model against an empty or
  // stale list, so the send button waits for the type's models to land.
  const isAwaitingModels = capabilities.hasModelSelection && isLoadingModels;
  const isSubmitBlocked =
    isGenerating ||
    isPromptEmpty ||
    isFirstFrameMissing ||
    isReferenceCombinationInvalid ||
    isKling4KReferenceInvalid ||
    isAwaitingModels ||
    isListening ||
    isTranscribing ||
    isUploading;
  const estimatedCredits =
    type === 'video' && selectedModel
      ? quoteVideoGenerationCredits({
          cost: selectedModel.cost,
          costPerUnit: selectedModel.costPerUnit,
          duration: settings.duration,
          minCost: selectedModel.minCost,
          modelKey: selectedModel.key,
          outputs: settings.outputs,
          pricingType: selectedModel.pricingType,
          resolution: settings.resolution,
        })
      : null;

  const handleModelChange = (_name: string, values: string[]) => {
    const modelKey = values[0] ?? AUTO_MODEL_OPTION_VALUE;
    onSettingsChange({
      modelKey,
      ...(type === 'video' && modelKey !== AUTO_MODEL_OPTION_VALUE
        ? { resolution: getDefaultVideoResolution(modelKey) ?? '' }
        : {}),
    });
  };

  const isRemixActive = useStudioRemixRunScope();
  const scope = buildStudioGenerationSetupScope(type);
  const defaults = getDefaultGenerationSetupValues(type);
  const setupFromStore = useGenerationSetupStore(
    (state) => state.setupByScope[scope],
  );
  const reasons =
    useGenerationSetupStore((state) => state.reasonsByScope[scope]) ?? {};
  const setup = setupFromStore ?? { sources: {}, values: defaults };
  const setupForComposer = {
    ...setup,
    values: { ...setup.values, type },
  };
  const {
    deleteLook,
    isLoading: isPresetsLoading,
    looks: presets,
    saveLook,
  } = useStudioLooks(type);
  const lookOptions = useStudioGenerationSetupLookOptions(
    type,
    settings.modelKey,
  );
  const typeOptions = listStudioGenerateTypeConfigs().map((config) => ({
    label: config.label,
    value: config.type,
  }));

  const debouncedPrompt = useDebounce(prompt, RECOMMENDATION_DEBOUNCE_MS);

  // biome-ignore lint/correctness/useExhaustiveDependencies: capabilities and defaults are pure functions of `type`, which is already a dep — including their fresh-per-render object identities would re-run this on every render and defeat the debounce.
  useEffect(() => {
    const recommendation = recommendGenerationSetup({
      capabilities,
      lockedType: type,
      prompt: debouncedPrompt,
      type,
    });
    applyGenerationSetupRecommendation(scope, recommendation, defaults);
  }, [debouncedPrompt, scope, type]);

  const handleSetField = useCallback(
    <K extends GenerationSetupFieldKey>(
      key: K,
      value: GenerationSetupValues[K],
    ) => {
      setGenerationSetupField(scope, key, value, defaults);
      if (
        key === 'modelKey' &&
        type === 'video' &&
        typeof value === 'string' &&
        value !== '' &&
        value !== AUTO_MODEL_OPTION_VALUE
      ) {
        setGenerationSetupField(
          scope,
          'resolution',
          getDefaultVideoResolution(value) ?? '',
          defaults,
        );
      }
    },
    [defaults, scope, type],
  );

  const handleResetField = useCallback(
    (key: GenerationSetupFieldKey) =>
      resetGenerationSetupField(scope, key, defaults),
    [defaults, scope],
  );

  const handleClearPreset = useCallback(
    () => clearGenerationSetupPreset(scope),
    [scope],
  );

  const handleApplyPreset = useCallback(
    (preset: IStudioLook) => {
      applyGenerationSetupPreset(
        scope,
        preset.id,
        presetToGenerationSetupValues(preset),
        defaults,
      );
    },
    [defaults, scope],
  );

  const handleSavePreset = useCallback(
    (label: string) => {
      void saveLook(label, setup.values);
    },
    [saveLook, setup],
  );

  const handleDeletePreset = useCallback(
    (presetId: string) => {
      void deleteLook(presetId);
    },
    [deleteLook],
  );

  return (
    <PromptBarComposer
      beforeBody={
        attachedAssets.length > 0 ? (
          <div className="px-3 pb-1 pt-3">
            <PromptBarAttachedAssetsTray
              assets={attachedAssets}
              isDisabled={isGenerating}
              onBrowseAssets={() => onOpenLibrary('reference')}
              onRemoveAttachedAsset={onRemoveAttachedAsset}
            />
          </div>
        ) : null
      }
      className={cn(isDragActive && 'ring-1 ring-primary/40')}
      data-testid="studio-generate-composer-shell"
    >
      <PromptEditor
        ariaLabel="Prompt"
        className="min-h-9 w-full"
        extraExtensions={extraExtensions}
        isDisabled={isGenerating}
        onDocumentChange={onPromptDocumentChange}
        onSubmit={() => {
          if (!isSubmitBlocked) {
            onSubmit();
          }
        }}
        onValueChange={onPromptChange}
        placeholder={
          isDragActive
            ? 'drop it here?'
            : capabilities.hasSpeech
              ? SCRIPT_PLACEHOLDER
              : PROMPT_PLACEHOLDER
        }
        testId="studio-generate-prompt"
        value={prompt}
      />

      <div className="mt-0.5 flex min-h-9 min-w-0 items-center justify-between gap-2 pt-1">
        <div className="flex min-w-0 shrink items-center gap-0.5">
          {isRemixActive ? (
            <>
              <ModelSelectorPopover
                autoLabel={
                  capabilities.hasModelSelection
                    ? isLoadingModels
                      ? translate('loadingModels')
                      : AUTO_PRIORITY_LABELS[settings.prioritize]
                    : undefined
                }
                className="max-w-[16rem] min-w-0"
                favoriteModelKeys={favoriteModelKeys}
                isDisabled={isGenerating}
                models={capabilities.hasModelSelection ? models : []}
                name="studioGenerateModel"
                onChange={handleModelChange}
                onFavoriteToggle={onFavoriteToggle}
                onPrioritizeChange={(prioritize: RouterPriority) =>
                  onSettingsChange({ prioritize })
                }
                prioritize={settings.prioritize}
                selectionMode="single"
                values={
                  capabilities.hasModelSelection
                    ? isAutoMode
                      ? [AUTO_MODEL_OPTION_VALUE]
                      : settings.modelKey
                        ? [settings.modelKey]
                        : []
                    : []
                }
              />

              <StudioGenerateSettingsPopover
                isDisabled={isGenerating}
                onChange={onSettingsChange}
                onReset={onResetSettings}
                settings={settings}
                type={type}
              />
            </>
          ) : (
            <GenerationSetupPopover
              capabilities={capabilities}
              favoriteModelKeys={favoriteModelKeys}
              isDisabled={isGenerating}
              isPresetsLoading={isPresetsLoading}
              lookOptions={lookOptions}
              models={capabilities.hasModelSelection ? models : []}
              onApplyPreset={handleApplyPreset}
              onClearPreset={handleClearPreset}
              onDeletePreset={handleDeletePreset}
              onFavoriteToggle={onFavoriteToggle}
              onResetAll={onResetSettings}
              onResetField={handleResetField}
              onSavePreset={handleSavePreset}
              onSetField={handleSetField}
              onTypeChange={onTypeChange}
              presets={presets}
              reasons={reasons}
              scopeKey={scope}
              setup={setupForComposer}
              typeOptions={typeOptions}
            />
          )}

          {capabilities.hasIdentity ? (
            <StudioIdentityFields
              isDisabled={isGenerating}
              onChange={onSettingsChange}
              settings={settings}
              type={type}
            />
          ) : null}

          {capabilities.hasReferences && type === 'image' ? (
            <PromptBarReferenceControls
              accept="image/*"
              isAttachmentDisabled={isGenerating || isUploading}
              isLibraryDisabled={isGenerating}
              onAddFiles={(files) => onAddFiles(files, 'reference')}
              onOpenLibrary={() => onOpenLibrary('reference')}
            />
          ) : null}

          {type === 'video' ? (
            <>
              <PromptBarReferenceControls
                accept="image/*"
                isAttachmentDisabled={isGenerating || isUploading}
                isLibraryDisabled={isGenerating}
                label={translate('startFrame')}
                onAddFiles={(files) => onAddFiles(files, 'startFrame')}
                onOpenLibrary={() => onOpenLibrary('startFrame')}
              />
              {!isAutoMode && hasEndFrame(settings.modelKey) ? (
                <PromptBarReferenceControls
                  accept="image/*"
                  isAttachmentDisabled={isGenerating || isUploading}
                  isLibraryDisabled={isGenerating}
                  label={translate('endFrame')}
                  onAddFiles={(files) => onAddFiles(files, 'endFrame')}
                  onOpenLibrary={() => onOpenLibrary('endFrame')}
                />
              ) : null}
              {!isAutoMode && hasVideoReferences(settings.modelKey) ? (
                <PromptBarReferenceControls
                  accept="video/*"
                  isAttachmentDisabled={isGenerating || isUploading}
                  isLibraryDisabled={isGenerating}
                  label={translate('videoReference')}
                  onAddFiles={(files) => onAddFiles(files, 'videoReference')}
                  onOpenLibrary={() => onOpenLibrary('videoReference')}
                />
              ) : null}
            </>
          ) : null}
        </div>

        <div className="-mr-2 flex shrink-0 items-center">
          {isFirstFrameMissing ? (
            <span
              aria-live="polite"
              className="mr-2 text-xs font-medium text-destructive"
            >
              {translate('startFrameRequired')}
            </span>
          ) : null}
          {isReferenceCombinationInvalid ? (
            <span
              aria-live="polite"
              className="mr-2 text-xs font-medium text-destructive"
            >
              {translate('seedanceReferenceConflict')}
            </span>
          ) : null}
          {isKling4KReferenceInvalid ? (
            <span
              aria-live="polite"
              className="mr-2 text-xs font-medium text-destructive"
            >
              {translate('kling4KReferenceConflict')}
            </span>
          ) : null}
          {estimatedCredits !== null ? (
            <span
              aria-live="polite"
              className="mr-2 text-xs font-medium text-muted-foreground"
            >
              {translate('estimatedCredits', { credits: estimatedCredits })}
            </span>
          ) : null}
          {isListening || isTranscribing || shouldShowVoiceInput ? (
            <PromptBarVoiceControl
              isDisabled={isGenerating}
              isListening={isListening}
              isTranscribing={isTranscribing}
              onStartListening={onStartListening}
              onStopListening={onStopListening}
            />
          ) : (
            <Button
              ariaLabel="Generate"
              className="size-9 shrink-0 min-h-0 min-w-0 p-0"
              icon={<ArrowUp className="size-4" />}
              isDisabled={isSubmitBlocked}
              isLoading={isGenerating}
              onClick={onSubmit}
              size={ButtonSize.ICON}
              variant={ButtonVariant.DEFAULT}
              withWrapper={false}
            />
          )}
        </div>
      </div>
    </PromptBarComposer>
  );
}
