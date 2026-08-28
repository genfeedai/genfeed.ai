'use client';

import {
  hasEndFrame,
  hasVideoReferences,
  MODEL_KEYS,
  requiresFirstFrame,
} from '@genfeedai/constants';
import {
  ButtonSize,
  ButtonVariant,
  type RouterPriority,
} from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { getDefaultVideoResolution } from '@genfeedai/helpers/media/video-resolution/video-resolution.helper';
import { quoteVideoGenerationCredits } from '@genfeedai/pricing';
import type { StudioGenerateComposerProps } from '@genfeedai/props/studio/studio-generate.props';
import StudioGenerateSettingsPopover from '@pages/studio/generate/components/StudioGenerateSettingsPopover';
import {
  getStudioGenerateTypeConfig,
  listStudioGenerateTypeConfigs,
  resolveStudioGenerateType,
} from '@pages/studio/generate/utils/studio-generate-types';
import ModelSelectorPopover from '@ui/dropdowns/model-selector/ModelSelectorPopover';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { useModelFavorites } from '@ui/dropdowns/model-selector/useModelFavorites';
import { Button } from '@ui/primitives/button';
import PromptBarAttachedAssetsTray from '@ui/prompt-bars/components/attached-assets-tray/PromptBarAttachedAssetsTray';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptBarReferenceControls from '@ui/prompt-bars/components/toolbar/PromptBarReferenceControls';
import PromptBarVoiceControl from '@ui/prompt-bars/components/toolbar/PromptBarVoiceControl';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import {
  ArrowUp,
  Clapperboard,
  Image as ImageIcon,
  Mic,
  Music,
  UserRound,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

/** Types whose prompt is spoken aloud rather than described to a renderer. */
const SCRIPT_PLACEHOLDER = 'Write the script you want spoken…';
const PROMPT_PLACEHOLDER = 'Describe what you want to generate…';

const STUDIO_GENERATION_CONTEXT_OPTIONS = listStudioGenerateTypeConfigs().map(
  (config) => ({
    description:
      config.type === 'image'
        ? 'Create still visuals'
        : config.type === 'video'
          ? 'Create motion and clips'
          : config.type === 'music'
            ? 'Generate original audio'
            : config.type === 'avatar'
              ? 'Animate a speaking avatar'
              : 'Generate spoken audio',
    icon:
      config.type === 'image'
        ? ImageIcon
        : config.type === 'video'
          ? Clapperboard
          : config.type === 'music'
            ? Music
            : config.type === 'avatar'
              ? UserRound
              : Mic,
    label: config.label,
    value: config.type,
  }),
);

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
          <ModelSelectorPopover
            autoLabel={
              capabilities.hasModelSelection
                ? isLoadingModels
                  ? translate('loadingModels')
                  : 'Auto'
                : undefined
            }
            className="max-w-[16rem] min-w-0"
            contextLabel="Generation type"
            contextOptions={STUDIO_GENERATION_CONTEXT_OPTIONS}
            contextValue={type}
            favoriteModelKeys={favoriteModelKeys}
            isDisabled={isGenerating}
            models={capabilities.hasModelSelection ? models : []}
            name="studioGenerateModel"
            onChange={handleModelChange}
            onContextChange={(value) =>
              onTypeChange(resolveStudioGenerateType(value))
            }
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
