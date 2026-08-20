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
import {
  useStudioRemixAvatarSelection,
  useStudioRemixRunScope,
} from '@pages/studio/generate/StudioRemixRunScope';
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
import PromptBarShell, {
  PROMPT_BAR_SURFACE_CLASS,
} from '@ui/prompt-bars/components/shell/PromptBarShell';
import { ArrowUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

const PROMPT_MAX_HEIGHT = 200;
const PROMPT_ROWS = 3;

/** Types whose prompt is spoken aloud rather than described to a renderer. */
const SCRIPT_PLACEHOLDER = 'Write the script you want spoken…';
const PROMPT_PLACEHOLDER = 'Describe what you want to generate…';
const REMIX_OUTPUT_TYPES = ['image', 'video', 'avatar'] as const;

function isRemixOutputType(
  value: string,
): value is (typeof REMIX_OUTPUT_TYPES)[number] {
  return REMIX_OUTPUT_TYPES.includes(
    value as (typeof REMIX_OUTPUT_TYPES)[number],
  );
}

/**
 * The single Studio composer. The asset type is state on this row rather than
 * a route segment, so switching Image → Video keeps the prompt and only swaps
 * the controls the new type actually supports.
 */
export default function StudioGenerateComposer({
  isGenerating,
  isLoadingModels,
  models,
  onPromptChange,
  onResetSettings,
  onSettingsChange,
  onSubmit,
  onTypeChange,
  prompt,
  settings,
  type,
}: StudioGenerateComposerProps): ReactElement {
  const translate = useTranslations('pages.studioGenerate');
  const { capabilities } = getStudioGenerateTypeConfig(type);
  const { favoriteModelKeys, onFavoriteToggle } = useModelFavorites();
  const isRemixRun = useStudioRemixRunScope();
  const canSelectAvatar = useStudioRemixAvatarSelection();

  const isPromptEmpty = prompt.trim().length === 0;
  // Submitting mid-catalog-load would resolve the model against an empty or
  // stale list, so the send button waits for the type's models to land.
  const isAwaitingModels =
    !isRemixRun && capabilities.hasModelSelection && isLoadingModels;
  const isSubmitBlocked =
    isGenerating ||
    isPromptEmpty ||
    isAwaitingModels ||
    (isRemixRun && !isRemixOutputType(type));
  const isAutoMode = settings.modelKey === AUTO_MODEL_OPTION_VALUE;

  const handleModelChange = (_name: string, values: string[]) => {
    onSettingsChange({ modelKey: values[0] ?? AUTO_MODEL_OPTION_VALUE });
  };

  return (
    // Same chrome as the Agent composer — `PromptBarShell` owns the glass
    // surface so the two bars stay cousins instead of look-alikes.
    <PromptBarShell
      className={PROMPT_BAR_SURFACE_CLASS}
      data-testid="studio-generate-composer-shell"
    >
      <div className="px-2.5 pb-1.5 pt-2">
        <Textarea
          className="min-h-[4.5rem] w-full resize-none border-0 bg-transparent px-2 py-1.5 text-sm shadow-none focus-visible:ring-0"
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
            capabilities.hasSpeech ? SCRIPT_PLACEHOLDER : PROMPT_PLACEHOLDER
          }
          rows={PROMPT_ROWS}
          value={prompt}
        />

        <div className="flex min-w-0 items-center justify-between gap-2 px-1 pt-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {isRemixRun ? (
              <Select
                disabled={isGenerating}
                onValueChange={(value) => {
                  if (isRemixOutputType(value)) {
                    onTypeChange(value);
                  }
                }}
                value={isRemixOutputType(type) ? type : undefined}
              >
                <SelectTrigger
                  aria-label="Output type"
                  className={cn('w-28', SHELL_CONTROL_HEIGHT_CLASS)}
                >
                  <SelectValue placeholder="Output type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">Image</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                  {canSelectAvatar ? (
                    <SelectItem value="avatar">Avatar</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            ) : (
              <StudioGenerateTypeSelector
                isDisabled={isGenerating}
                onChange={onTypeChange}
                type={type}
              />
            )}

            {!isRemixRun && capabilities.hasModelSelection ? (
              isLoadingModels ? (
                <Select disabled value="">
                  <SelectTrigger
                    className={cn('w-44', SHELL_CONTROL_HEIGHT_CLASS)}
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
                    className="w-44 min-w-0 border border-border bg-background hover:bg-accent/50"
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
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              ariaLabel="Generate"
              className="size-8 shrink-0 min-h-0 min-w-0 p-0"
              icon={<ArrowUp className="size-4" />}
              isDisabled={isSubmitBlocked}
              isLoading={isGenerating}
              onClick={onSubmit}
              size={ButtonSize.ICON}
              variant={ButtonVariant.DEFAULT}
              withWrapper={false}
            />
          </div>
        </div>
      </div>
    </PromptBarShell>
  );
}
