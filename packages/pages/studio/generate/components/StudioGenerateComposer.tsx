'use client';

import {
  ButtonSize,
  ButtonVariant,
  type RouterPriority,
} from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { StudioGenerateComposerProps } from '@genfeedai/props/studio/studio-generate.props';
import StudioGenerateSettingsPopover from '@pages/studio/generate/components/StudioGenerateSettingsPopover';
import StudioGenerateTypeSelector from '@pages/studio/generate/components/StudioGenerateTypeSelector';
import { getStudioGenerateTypeConfig } from '@pages/studio/generate/utils/studio-generate-types';
import { SHELL_CONTROL_HEIGHT_CLASS } from '@ui/constants/shell-chrome.constant';
import ModelSelectorPopover from '@ui/dropdowns/model-selector/ModelSelectorPopover';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { useModelFavorites } from '@ui/dropdowns/model-selector/useModelFavorites';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import PromptBarAttachedAssetsTray from '@ui/prompt-bars/components/attached-assets-tray/PromptBarAttachedAssetsTray';
import PromptBarBody from '@ui/prompt-bars/components/shell/PromptBarBody';
import PromptBarShell, {
  PROMPT_BAR_SURFACE_CLASS,
} from '@ui/prompt-bars/components/shell/PromptBarShell';
import PromptBarReferenceControls from '@ui/prompt-bars/components/toolbar/PromptBarReferenceControls';
import PromptBarVoiceControl from '@ui/prompt-bars/components/toolbar/PromptBarVoiceControl';
import { ArrowUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

const PROMPT_MAX_HEIGHT = 112;
const PROMPT_ROWS = 1;

/** Types whose prompt is spoken aloud rather than described to a renderer. */
const SCRIPT_PLACEHOLDER = 'Write the script you want spoken…';
const PROMPT_PLACEHOLDER = 'Describe what you want to generate…';

/**
 * The single Studio composer. The asset type is state on this row rather than
 * a route segment, so switching Image → Video keeps the prompt and only swaps
 * the controls the new type actually supports.
 */
export default function StudioGenerateComposer({
  attachedAssets,
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
  // Submitting mid-catalog-load would resolve the model against an empty or
  // stale list, so the send button waits for the type's models to land.
  const isAwaitingModels = capabilities.hasModelSelection && isLoadingModels;
  const isSubmitBlocked =
    isGenerating ||
    isPromptEmpty ||
    isAwaitingModels ||
    isListening ||
    isTranscribing ||
    isUploading;
  const isAutoMode = settings.modelKey === AUTO_MODEL_OPTION_VALUE;

  const handleModelChange = (_name: string, values: string[]) => {
    onSettingsChange({ modelKey: values[0] ?? AUTO_MODEL_OPTION_VALUE });
  };

  return (
    <PromptBarShell
      className={cn(
        PROMPT_BAR_SURFACE_CLASS,
        isDragActive && 'ring-1 ring-primary/40',
      )}
      data-testid="studio-generate-composer-shell"
    >
      {attachedAssets.length > 0 ? (
        <div className="px-3 pb-1 pt-3">
          <PromptBarAttachedAssetsTray
            assets={attachedAssets}
            isDisabled={isGenerating}
            onBrowseAssets={onOpenLibrary}
            onRemoveAttachedAsset={onRemoveAttachedAsset}
          />
        </div>
      ) : null}

      <PromptBarBody>
        <Textarea
          className="min-h-9 w-full resize-none border-0 bg-transparent px-0 py-1.5 text-sm shadow-none focus-visible:ring-0"
          id="studio-generate-prompt"
          isDisabled={isGenerating}
          maxHeight={PROMPT_MAX_HEIGHT}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key !== 'Enter' ||
              event.shiftKey ||
              event.nativeEvent.isComposing ||
              isSubmitBlocked
            ) {
              return;
            }
            event.preventDefault();
            onSubmit();
          }}
          placeholder={
            isDragActive
              ? 'drop it here?'
              : capabilities.hasSpeech
                ? SCRIPT_PLACEHOLDER
                : PROMPT_PLACEHOLDER
          }
          rows={PROMPT_ROWS}
          value={prompt}
        />

        <div className="mt-0.5 flex min-h-9 min-w-0 items-center justify-between gap-2 pt-1">
          <div className="flex min-w-0 shrink items-center gap-0.5">
            <StudioGenerateTypeSelector
              isDisabled={isGenerating}
              onChange={onTypeChange}
              type={type}
            />

            {capabilities.hasModelSelection ? (
              isLoadingModels ? (
                <Select disabled value="">
                  <SelectTrigger
                    className={cn('max-w-[12rem]', SHELL_CONTROL_HEIGHT_CLASS)}
                  >
                    <SelectValue placeholder={translate('loadingModels')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="loading">
                      {translate('loadingModels')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div
                  className={
                    isGenerating ? 'pointer-events-none opacity-50' : ''
                  }
                >
                  <ModelSelectorPopover
                    autoLabel="Auto"
                    className="max-w-[12rem] min-w-0 border border-border bg-background hover:bg-accent/50"
                    favoriteModelKeys={favoriteModelKeys}
                    models={models}
                    name="studioGenerateModel"
                    onChange={handleModelChange}
                    onFavoriteToggle={onFavoriteToggle}
                    onPrioritizeChange={(prioritize: RouterPriority) =>
                      onSettingsChange({ prioritize })
                    }
                    prioritize={settings.prioritize}
                    selectionMode="single"
                    values={
                      isAutoMode
                        ? [AUTO_MODEL_OPTION_VALUE]
                        : settings.modelKey
                          ? [settings.modelKey]
                          : []
                    }
                  />
                </div>
              )
            ) : null}

            <StudioGenerateSettingsPopover
              isDisabled={isGenerating}
              onChange={onSettingsChange}
              onReset={onResetSettings}
              settings={settings}
              type={type}
            />

            {capabilities.hasReferences ? (
              <PromptBarReferenceControls
                accept="image/*"
                isAttachmentDisabled={isGenerating || isUploading}
                isLibraryDisabled={isGenerating}
                onAddFiles={onAddFiles}
                onOpenLibrary={onOpenLibrary}
              />
            ) : null}
          </div>

          <div className="-mr-2 flex shrink-0 items-center">
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
      </PromptBarBody>
    </PromptBarShell>
  );
}
