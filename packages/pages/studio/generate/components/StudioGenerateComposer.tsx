'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  FLUX_3_ASPECT_RATIOS,
  FLUX_3_RESOLUTIONS,
  getImageEditMaxSources,
  hasEndFrame,
  hasVideoReferences,
  IMAGE_EDIT_SIZES,
  isFlux3ImageModel,
  isFlux3Resolution,
  isImageEditSize,
  MODEL_KEYS,
  normalizeMusicSettings,
  requiresFirstFrame,
} from '@genfeedai/contracts/constants';
import type { IStudioLook } from '@genfeedai/contracts/interfaces';
import type {
  GenerationSetupFieldKey,
  GenerationSetupValues,
} from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { getDefaultVideoResolution } from '@genfeedai/helpers/media/video-resolution/video-resolution.helper';
import { useDesktopRuntimeContext } from '@genfeedai/hooks/ui/use-desktop-runtime-context/use-desktop-runtime-context';
import { resolveStudioGenerationCost } from '@genfeedai/pricing';
import type { StudioGenerateComposerProps } from '@genfeedai/props/studio/studio-generate.props';
import { canSubmitStudioGeneration } from '@genfeedai/services/core/desktop-runtime.service';
import { useDebounce } from '@hooks/utils/use-debounce/use-debounce';
import StudioGenerationSummary from '@pages/studio/generate/components/StudioGenerationSummary';
import StudioIdentityFields from '@pages/studio/generate/components/StudioIdentityFields';
import { useStudioGenerationSetupLookOptions } from '@pages/studio/generate/hooks/useStudioGenerationSetupLookOptions';
import {
  presetToGenerationSetupValues,
  useStudioLooks,
} from '@pages/studio/generate/hooks/useStudioLooks';
import {
  isStudioGenerateType,
  listStudioGenerateTypeConfigs,
  resolveStudioGenerateCapabilities,
} from '@pages/studio/generate/utils/studio-generate-types';
import { getDefaultGenerationSetupValues } from '@pages/studio/generate/utils/studio-generation-setup-bridge';
import GenerationHarnessSettingsPopover from '@ui/dropdowns/generation-setup/GenerationHarnessSettingsPopover';
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
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { useModelFavorites } from '@ui/dropdowns/model-selector/useModelFavorites';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import Spinner from '@ui/primitives/spinner';
import PromptBarAttachedAssetsTray from '@ui/prompt-bars/components/attached-assets-tray/PromptBarAttachedAssetsTray';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptBarReferenceControls from '@ui/prompt-bars/components/toolbar/PromptBarReferenceControls';
import PromptBarVoiceControl from '@ui/prompt-bars/components/toolbar/PromptBarVoiceControl';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import { ArrowUp, WandSparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';

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
  documentSeed,
  extraExtensions,
  isDragActive = false,
  isEnhancingPrompt = false,
  isGenerating,
  isListening,
  isLoadingModels,
  isTranscribing,
  isUploading,
  models,
  onAddFiles,
  onCancelEnhancePrompt,
  onEnhancePrompt,
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
  onUndoEnhancePrompt,
  prompt,
  previousPrompt = null,
  settings,
  shouldShowVoiceInput,
  type,
}: StudioGenerateComposerProps): ReactElement {
  const translate = useTranslations('pages.studioGenerate');
  const runtime = useDesktopRuntimeContext();
  const isRuntimeBlocked = !canSubmitStudioGeneration(runtime);
  const guardedSubmit = () => {
    if (canSubmitStudioGeneration()) onSubmit();
  };
  // Narrowed against the selected model's own registry capability — the
  // static per-type config is only the widest case across every music
  // model (see `resolveStudioGenerateCapabilities`).
  const effectiveModelKey =
    settings.modelKey === AUTO_MODEL_OPTION_VALUE && type === 'image-edit'
      ? models.find((model) => model.isDefault)?.key
      : settings.modelKey;
  const isFlux = isFlux3ImageModel(effectiveModelKey ?? '');
  const editSourceLimit = getImageEditMaxSources(effectiveModelKey);
  const capabilities = resolveStudioGenerateCapabilities(
    type,
    effectiveModelKey,
  );
  const unsupportedEditingControls =
    isFlux &&
    type === 'image-edit' &&
    (settings.editSeed !== undefined ||
      attachedAssets.some((asset) => asset.role === 'editMask'));
  const [droppedEditingControls, setDroppedEditingControls] = useState(false);
  useEffect(() => {
    if (!isFlux) {
      setDroppedEditingControls(false);
      return;
    }
    if (unsupportedEditingControls) setDroppedEditingControls(true);
    const patch: Partial<typeof settings> = {};
    if (settings.outputs !== 1) patch.outputs = 1;
    if (!isFlux3Resolution(settings.resolution)) patch.resolution = '1k';
    if (settings.editSeed !== undefined) patch.editSeed = undefined;
    if (settings.editSize !== undefined) patch.editSize = undefined;
    for (const asset of attachedAssets)
      if (asset.role === 'editMask') onRemoveAttachedAsset(asset.id);
    if (Object.keys(patch).length) onSettingsChange(patch);
  }, [
    isFlux,
    unsupportedEditingControls,
    settings.outputs,
    settings.resolution,
    settings.editSeed,
    settings.editSize,
    attachedAssets,
    onRemoveAttachedAsset,
    onSettingsChange,
  ]);
  useEffect(() => {
    if (type !== 'music') return;
    const normalized = normalizeMusicSettings(settings.modelKey, {
      duration: settings.duration,
      instrumental: settings.instrumental,
      lyrics: settings.lyrics,
    });
    if (
      normalized.duration !== settings.duration ||
      normalized.instrumental !== settings.instrumental ||
      normalized.lyrics !== settings.lyrics
    )
      onSettingsChange(normalized);
  }, [
    type,
    settings.modelKey,
    settings.duration,
    settings.instrumental,
    settings.lyrics,
    onSettingsChange,
  ]);
  const { favoriteModelKeys, onFavoriteToggle } = useModelFavorites();

  const isPromptEmpty = prompt.trim().length === 0;
  const isAutoMode = settings.modelKey === AUTO_MODEL_OPTION_VALUE;
  const selectedModel = models.find((model) =>
    type === 'image-edit' && isAutoMode
      ? model.isDefault
      : model.key === settings.modelKey,
  );
  const displaySettings =
    type === 'image-edit' && isAutoMode && selectedModel
      ? { ...settings, modelKey: selectedModel.key }
      : settings;
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
  const editSources = attachedAssets.filter(
    (asset) => asset.role === 'editSource',
  );
  const hasEditMask = attachedAssets.some((asset) => asset.role === 'editMask');
  const isEditSourceMissing =
    type === 'image-edit' &&
    (editSources.length < 1 || editSources.length > editSourceLimit);
  const isEditingModelUnavailable =
    type === 'image-edit' &&
    !isLoadingModels &&
    (isAutoMode ? !models.some((model) => model.isDefault) : !selectedModel);
  const isSubmitBlocked =
    isEditSourceMissing ||
    isEditingModelUnavailable ||
    isRuntimeBlocked ||
    isGenerating ||
    isPromptEmpty ||
    isFirstFrameMissing ||
    isReferenceCombinationInvalid ||
    isKling4KReferenceInvalid ||
    isAwaitingModels ||
    isListening ||
    isTranscribing ||
    isUploading;
  const estimate = resolveStudioGenerationCost({
    isLoadingModels,
    model: selectedModel,
    settings: displaySettings,
    type,
  });

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: `recommendGenerationSetup` only reads the type-level capability flags (aspect ratio, duration, model selection, outputs, brand) that stay constant for a given `type`, which is already a dep. `capabilities.hasInstrumentalToggle`/`hasLyrics` do vary with `settings.modelKey`, but nothing this effect reads depends on them, so omitting `settings.modelKey` here doesn't skip a real update — and including capabilities'/defaults' fresh-per-render object identities would re-run this on every render and defeat the debounce.
  useEffect(() => {
    if (type === 'image-edit') return;
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
        typeof value === 'string' &&
        isFlux3ImageModel(value)
      ) {
        setGenerationSetupField(scope, 'resolution', '1k', defaults);
        setGenerationSetupField(scope, 'aspectRatio', 'auto', defaults);
        setGenerationSetupField(scope, 'outputs', 1, defaults);
      }
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
              onBrowseAssets={() =>
                onOpenLibrary(
                  type === 'image-edit' ? 'editSource' : 'reference',
                )
              }
              onRemoveAttachedAsset={onRemoveAttachedAsset}
            />
          </div>
        ) : null
      }
      className={cn(isDragActive && 'ring-1 ring-primary/40')}
      data-testid="studio-generate-composer-shell"
    >
      <PromptEditor
        ariaLabel={translate('prompt')}
        className="min-h-9 w-full"
        documentSeed={documentSeed}
        extraExtensions={type === 'image-edit' ? undefined : extraExtensions}
        isDisabled={isGenerating}
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
        testId="studio-generate-prompt"
        value={prompt}
      />

      {isFlux ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select
            value={settings.resolution}
            disabled={isGenerating}
            onValueChange={(resolution) => onSettingsChange({ resolution })}
          >
            <SelectTrigger
              aria-label={translate('editImage.fluxResolution')}
              className="w-40"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FLUX_3_RESOLUTIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {value.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={settings.aspectRatio}
            disabled={isGenerating}
            onValueChange={(aspectRatio) => onSettingsChange({ aspectRatio })}
          >
            <SelectTrigger
              aria-label={translate('editImage.fluxAspectRatio')}
              className="w-52"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FLUX_3_ASPECT_RATIOS.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === 'auto'
                    ? type === 'image-edit'
                      ? translate('editImage.matchSourceAspectRatio')
                      : translate('editImage.autoAspectRatio')
                    : value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {droppedEditingControls ? (
            <p role="status" className="text-xs text-muted-foreground">
              {translate('editImage.removedFluxControls')}
            </p>
          ) : null}
        </div>
      ) : null}
      {type === 'image-edit' ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {editSources.length > 1 ? (
            <Select
              value={
                settings.editPrimaryId ??
                editSources[0].ingredientId ??
                editSources[0].id
              }
              disabled={isGenerating}
              onValueChange={(editPrimaryId) =>
                onSettingsChange({ editPrimaryId })
              }
            >
              <SelectTrigger
                aria-label={translate('editImage.targetAria')}
                className="w-44"
              >
                <SelectValue
                  placeholder={translate('editImage.targetPlaceholder')}
                />
              </SelectTrigger>
              <SelectContent>
                {editSources.map((asset, index) => (
                  <SelectItem
                    key={asset.id}
                    value={asset.ingredientId ?? asset.id}
                  >
                    {translate('editImage.target', {
                      name:
                        asset.name ||
                        translate('editImage.sourceFallback', {
                          index: index + 1,
                        }),
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {!isFlux ? (
            <>
              <Select
                disabled={isGenerating || hasEditMask}
                value={hasEditMask ? 'source' : (settings.editSize ?? 'source')}
                onValueChange={(value) => {
                  if (isImageEditSize(value))
                    onSettingsChange({ editSize: value });
                }}
              >
                <SelectTrigger
                  aria-label={translate('editImage.outputSize')}
                  className="w-40"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_EDIT_SIZES.map((size) => (
                    <SelectItem key={size} value={size}>
                      {size === 'source'
                        ? translate('editImage.sourceDimensions')
                        : size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                aria-label={translate('editImage.seedAria')}
                className="w-36"
                type="number"
                min={0}
                max={2147483647}
                step={1}
                placeholder={translate('editImage.seedPlaceholder')}
                value={settings.editSeed ?? ''}
                isDisabled={isGenerating}
                onChange={(event) =>
                  onSettingsChange({
                    editSeed:
                      event.target.value === ''
                        ? undefined
                        : Number(event.target.value),
                  })
                }
              />
            </>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {translate('editImage.firstSource', {
              count: editSources.length,
              limit: editSourceLimit,
            })}
            {isFlux
              ? translate('editImage.fluxSemantics')
              : translate('editImage.maskSemantics')}
          </p>
          {isEditSourceMissing || isEditingModelUnavailable ? (
            <p role="status" className="text-xs text-destructive">
              {isEditSourceMissing
                ? editSources.length > editSourceLimit
                  ? translate('editImage.overLimit', { limit: editSourceLimit })
                  : translate('editImage.chooseSource')
                : translate('editImage.modelUnavailable')}
            </p>
          ) : null}
        </div>
      ) : null}
      <StudioGenerationSummary
        estimate={estimate}
        isLoadingModels={isLoadingModels}
        model={selectedModel}
        settings={displaySettings}
        type={type}
      />

      {isFirstFrameMissing ||
      isReferenceCombinationInvalid ||
      isKling4KReferenceInvalid ? (
        <p
          aria-live="polite"
          className="mt-1 text-xs font-medium text-destructive"
        >
          {isFirstFrameMissing
            ? translate('startFrameRequired')
            : isReferenceCombinationInvalid
              ? translate('seedanceReferenceConflict')
              : translate('kling4KReferenceConflict')}
        </p>
      ) : null}
      <div className="mt-0.5 flex min-h-9 min-w-0 flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
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
            onTypeChange={(nextType) => {
              // The shared popover speaks GenerationSetupType; Studio only
              // offers its own registry, so anything else is not a Studio pick.
              if (isStudioGenerateType(nextType)) {
                onTypeChange(nextType);
              }
            }}
            presets={presets}
            reasons={reasons}
            scopeKey={scope}
            setup={setupForComposer}
            typeOptions={typeOptions}
          />

          {type === 'image' || type === 'video' ? (
            <GenerationHarnessSettingsPopover isDisabled={isGenerating} />
          ) : null}

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

          {type === 'image-edit' ? (
            <>
              <PromptBarReferenceControls
                accept="image/*"
                label={translate('editImage.sourceImages')}
                isAttachmentDisabled={
                  isGenerating ||
                  isUploading ||
                  editSources.length >= editSourceLimit
                }
                isLibraryDisabled={
                  isGenerating || editSources.length >= editSourceLimit
                }
                onAddFiles={(files) => onAddFiles(files, 'editSource')}
                onOpenLibrary={() => onOpenLibrary('editSource')}
              />
              {!isFlux ? (
                <PromptBarReferenceControls
                  accept="image/*"
                  label={translate('editImage.maskOptional')}
                  isAttachmentDisabled={isGenerating || isUploading}
                  isLibraryDisabled={isGenerating}
                  onAddFiles={(files) => onAddFiles(files, 'editMask')}
                  onOpenLibrary={() => onOpenLibrary('editMask')}
                />
              ) : null}
            </>
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

        <div className="-mr-2 ml-auto flex shrink-0 items-center">
          {!isEnhancingPrompt && previousPrompt !== null ? (
            <Button
              ariaLabel={translate('undoPromptEnhancement')}
              className="h-7 shrink-0 px-2 text-2xs"
              isDisabled={isGenerating}
              label={translate('undo')}
              onClick={onUndoEnhancePrompt}
              size={ButtonSize.XS}
              textTransform="none"
              variant={ButtonVariant.GHOST}
            />
          ) : null}
          {onEnhancePrompt && type !== 'image-edit' ? (
            <Button
              ariaLabel={
                isEnhancingPrompt
                  ? translate('cancelEnhancingPrompt')
                  : translate('enhancePrompt')
              }
              className="size-9 shrink-0 min-h-0 min-w-0 p-0"
              icon={
                isEnhancingPrompt ? (
                  <Spinner className="size-4" />
                ) : (
                  <WandSparkles className="size-4" />
                )
              }
              // The composer stays usable during enhancement: while pending,
              // the button switches to Cancel instead of disabling (#4676).
              isDisabled={isGenerating || (!isEnhancingPrompt && isPromptEmpty)}
              onClick={
                isEnhancingPrompt ? onCancelEnhancePrompt : onEnhancePrompt
              }
              size={ButtonSize.ICON}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
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
              ariaLabel={translate('generate')}
              className="size-9 shrink-0 min-h-0 min-w-0 p-0"
              icon={<ArrowUp className="size-4" />}
              isDisabled={isSubmitBlocked}
              isLoading={isGenerating}
              onClick={guardedSubmit}
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
