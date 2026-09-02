import type { GenerationModel } from '@genfeedai/agent/services/agent-api.service';
import {
  GENERATION_PROMPT_COMPACT_MAX_HEIGHT,
  GENERATION_PROMPT_COMPACT_ROWS,
  shouldOfferGenerationPromptPreview,
} from '@genfeedai/agent/utils/generation-prompt-preview.util';
import {
  ButtonSize,
  ButtonVariant,
  DropdownDirection,
  type RouterPriority,
} from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import { SHELL_CONTROL_HEIGHT_CLASS } from '@ui/constants/shell-chrome.constant';
import AspectRatioDropdown from '@ui/dropdowns/aspect-ratio/AspectRatioDropdown';
import ModelSelectorPopover from '@ui/dropdowns/model-selector/ModelSelectorPopover';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { useModelFavorites } from '@ui/dropdowns/model-selector/useModelFavorites';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@ui/primitives/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { ArrowUp, Expand, RefreshCw, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, type RefObject, useState } from 'react';

type GenerationActionCardControlsProps = {
  prompt: string;
  onPromptChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  isDisabled: boolean;
  modelsLoading: boolean;
  modelsError: string | null;
  isAllowlistEmpty?: boolean;
  onRetryLoadModels: () => void;
  filteredModels: GenerationModel[];
  isAutoMode: boolean;
  modelKey: string;
  autoModelLabel: string;
  prioritize: RouterPriority;
  onPrioritizeChange: (value: RouterPriority) => void;
  onModelChange: (name: string, values: string[]) => void;
  outputs: number;
  maxOutputs: number;
  onOutputsChange: (value: number) => void;
  aspectRatio: string;
  availableAspectRatios: string[];
  onAspectRatioChange: (name: string, value: string) => void;
  showDuration: boolean;
  duration: number;
  durationOptions: number[];
  estimatedCredits?: number | null;
  onDurationChange: (value: number) => void;
  resolution?: string;
  resolutionOptions: readonly { label: string; value: string }[];
  onResolutionChange: (value: string) => void;
  isImage: boolean;
  isPromptEmpty: boolean;
  showGenerate: boolean;
  showStop?: boolean;
  onGenerate: () => void;
  onStop?: () => void;
};

export function GenerationActionCardControls({
  prompt,
  onPromptChange,
  textareaRef,
  isDisabled,
  modelsLoading,
  modelsError,
  isAllowlistEmpty = false,
  onRetryLoadModels,
  filteredModels,
  isAutoMode,
  modelKey,
  autoModelLabel,
  prioritize,
  onPrioritizeChange,
  onModelChange,
  outputs,
  maxOutputs,
  onOutputsChange,
  aspectRatio,
  availableAspectRatios,
  onAspectRatioChange,
  showDuration,
  duration,
  durationOptions,
  estimatedCredits,
  onDurationChange,
  resolution,
  resolutionOptions,
  onResolutionChange,
  isImage,
  isPromptEmpty,
  showGenerate,
  showStop = false,
  onGenerate,
  onStop,
}: GenerationActionCardControlsProps): ReactElement {
  const translate = useTranslations('agent.generationActionCard');
  const { favoriteModelKeys, onFavoriteToggle } = useModelFavorites();
  const [isPromptPreviewOpen, setIsPromptPreviewOpen] = useState(false);
  // An empty catalog is indistinguishable from a failed fetch at the picker —
  // both render a control the user can open but never select anything from.
  // Treat them as one explicit, recoverable state instead.
  const hasNoSelectableModels = !modelsLoading && filteredModels.length === 0;
  const canPreviewPrompt = shouldOfferGenerationPromptPreview(prompt);
  const trailingControlClass = 'size-8 shrink-0 min-h-0 min-w-0 p-0';

  return (
    <>
      <div>
        <label htmlFor="gen-action-prompt" className="sr-only">
          {translate('promptLabel')}
        </label>
        <div className="flex items-center gap-1.5">
          <Textarea
            id="gen-action-prompt"
            ref={textareaRef}
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            onKeyDown={(event) => {
              if (
                event.key !== 'Enter' ||
                event.shiftKey ||
                event.nativeEvent.isComposing ||
                isDisabled ||
                isPromptEmpty ||
                !showGenerate
              ) {
                return;
              }
              event.preventDefault();
              onGenerate();
            }}
            disabled={isDisabled}
            maxHeight={GENERATION_PROMPT_COMPACT_MAX_HEIGHT}
            rows={GENERATION_PROMPT_COMPACT_ROWS}
            className="min-h-8 h-8 max-h-8 w-full resize-none overflow-hidden py-1.5"
            placeholder="Describe what you want to generate…"
          />
          {canPreviewPrompt ? (
            <Button
              ariaLabel={translate('readFullAria')}
              className={cn(
                'shrink-0 px-2 text-xs',
                SHELL_CONTROL_HEIGHT_CLASS,
              )}
              icon={<Expand className="size-3.5" />}
              label={translate('readFull')}
              onClick={() => setIsPromptPreviewOpen(true)}
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          ) : null}
        </div>
      </div>

      <Dialog open={isPromptPreviewOpen} onOpenChange={setIsPromptPreviewOpen}>
        <DialogPortal>
          <DialogOverlay
            className={
              'bg-black/60 backdrop-blur-[1px]' /* design-system-allow-content-color */
            }
          />
          <DialogContent className="max-h-[90dvh] max-w-2xl overflow-hidden border-border-strong bg-popover p-0">
            <DialogHeader className="border-b border-border px-5 py-4">
              <DialogTitle>{translate('previewTitle')}</DialogTitle>
              <DialogDescription>
                {translate('previewDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className="p-5">
              <Textarea
                aria-label={translate('previewEditorAria')}
                className="min-h-[20rem] w-full resize-y overflow-y-auto text-sm leading-6"
                disabled={isDisabled}
                id="gen-action-prompt-full"
                maxHeight={480}
                onChange={(event) => onPromptChange(event.target.value)}
                placeholder="Describe what you want to generate…"
                rows={16}
                value={prompt}
              />
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>

      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <div className="min-w-0 shrink">
            {modelsLoading ? (
              <Select disabled value="loading-models">
                <SelectTrigger
                  className={cn('w-44', SHELL_CONTROL_HEIGHT_CLASS)}
                >
                  <SelectValue placeholder={translate('loadingModels')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="loading-models">
                    {translate('loadingModels')}
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : isAllowlistEmpty ? (
              <Button
                ariaLabel={translate('noModelsEnabled')}
                variant={ButtonVariant.GHOST}
                size={ButtonSize.SM}
                isDisabled
                className={cn('w-44 justify-start', SHELL_CONTROL_HEIGHT_CLASS)}
                textTransform="none"
                title={translate('noModelsEnabledTitle')}
              >
                <span className="truncate text-xs">
                  {translate('noModelsEnabled')}
                </span>
              </Button>
            ) : modelsError || hasNoSelectableModels ? (
              <Button
                variant={ButtonVariant.GHOST}
                size={ButtonSize.SM}
                onClick={onRetryLoadModels}
                disabled={isDisabled}
                className={cn('w-44 justify-start', SHELL_CONTROL_HEIGHT_CLASS)}
                title={modelsError ?? 'No models available for this generation'}
              >
                <RefreshCw className="mr-2 h-3 w-3 shrink-0" />
                <span className="truncate text-xs">
                  {modelsError ? 'Models failed — retry' : 'No models — retry'}
                </span>
              </Button>
            ) : (
              <div
                className={isDisabled ? 'pointer-events-none opacity-50' : ''}
              >
                <ModelSelectorPopover
                  name="models"
                  className="w-44 min-w-0 border-0 bg-transparent shadow-none hover:bg-hover"
                  models={filteredModels}
                  values={
                    isAutoMode
                      ? [AUTO_MODEL_OPTION_VALUE]
                      : modelKey
                        ? [modelKey]
                        : []
                  }
                  autoLabel={autoModelLabel}
                  prioritize={prioritize}
                  onPrioritizeChange={onPrioritizeChange}
                  favoriteModelKeys={favoriteModelKeys}
                  onFavoriteToggle={onFavoriteToggle}
                  onChange={onModelChange}
                  selectionMode="single"
                />
              </div>
            )}
          </div>
          <div className="shrink-0">
            <AspectRatioDropdown
              name="aspectRatio"
              value={aspectRatio}
              ratios={availableAspectRatios}
              onChange={onAspectRatioChange}
              className="border-0 bg-transparent shadow-none hover:bg-hover"
              isDisabled={isDisabled}
              direction={DropdownDirection.UP}
              placeholder="Aspect ratio"
            />
          </div>
          {isImage ? (
            <div className="shrink-0">
              <ButtonDropdown
                name="outputs"
                value={String(outputs)}
                options={Array.from({ length: maxOutputs }, (_, index) => {
                  const count = index + 1;
                  return {
                    label: `${count}x`,
                    value: String(count),
                  };
                })}
                onChange={(_name, value) => onOutputsChange(Number(value))}
                className="border-0 bg-transparent shadow-none hover:bg-hover"
                isDisabled={isDisabled}
                direction={DropdownDirection.UP}
                placeholder="1x"
                tooltip="Number of outputs"
              />
            </div>
          ) : null}
          {showDuration ? (
            <div className="shrink-0">
              <Select
                value={String(duration)}
                onValueChange={(value) => onDurationChange(Number(value))}
                disabled={isDisabled}
              >
                <SelectTrigger
                  aria-label="Duration in seconds"
                  id="gen-action-duration"
                  className={cn(
                    'w-28 border-0 bg-transparent shadow-none hover:bg-hover',
                    SHELL_CONTROL_HEIGHT_CLASS,
                  )}
                >
                  <SelectValue placeholder="Duration" />
                </SelectTrigger>
                <SelectContent>
                  {durationOptions.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {translate('durationSeconds', { seconds: option })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {!isImage && resolutionOptions.length > 0 ? (
            <div className="shrink-0">
              <Select
                disabled={isDisabled}
                onValueChange={onResolutionChange}
                value={resolution}
              >
                <SelectTrigger
                  aria-label="Video resolution"
                  className={cn('w-32', SHELL_CONTROL_HEIGHT_CLASS)}
                >
                  <SelectValue placeholder="Resolution" />
                </SelectTrigger>
                <SelectContent>
                  {resolutionOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {estimatedCredits !== null && estimatedCredits !== undefined ? (
            <span
              aria-live="polite"
              className="mr-1 text-xs font-medium text-muted-foreground"
            >
              {translate('estimatedCredits', { credits: estimatedCredits })}
            </span>
          ) : null}
          {showStop ? (
            <Button
              ariaLabel={translate('stopAria')}
              className={trailingControlClass}
              icon={
                <Square
                  aria-hidden
                  className="size-2.5 fill-current stroke-none"
                />
              }
              onClick={onStop}
              size={ButtonSize.ICON}
              tooltip={translate('stop')}
              variant={ButtonVariant.DESTRUCTIVE}
              withWrapper={false}
            />
          ) : null}

          {showGenerate ? (
            <Button
              ariaLabel={
                isImage
                  ? translate('generateAria')
                  : translate('generateVideoAria')
              }
              className={trailingControlClass}
              icon={<ArrowUp className="size-4" />}
              isDisabled={isPromptEmpty || isAllowlistEmpty}
              onClick={onGenerate}
              size={ButtonSize.ICON}
              tooltip={translate('generateTooltip')}
              variant={ButtonVariant.DEFAULT}
              withWrapper={false}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
