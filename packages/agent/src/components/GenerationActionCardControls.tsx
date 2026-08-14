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
} from '@genfeedai/enums';
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
import { Expand, Play, RefreshCw, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, type RefObject, useState } from 'react';

type GenerationActionCardControlsProps = {
  prompt: string;
  onPromptChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  isDisabled: boolean;
  modelsLoading: boolean;
  modelsError: string | null;
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
  onDurationChange: (value: number) => void;
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
  onDurationChange,
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

  return (
    <>
      <div>
        <label
          htmlFor="gen-action-prompt"
          className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
        >
          Prompt
        </label>
        <div className="flex items-center gap-2">
          <Textarea
            id="gen-action-prompt"
            ref={textareaRef}
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
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
          <DialogOverlay className="bg-black/60 backdrop-blur-[1px]" />
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

      {/* Model & Aspect Ratio row — wrap on narrow tracks so controls never
          force the conversation column wider than the viewport. */}
      <div className="flex min-w-0 flex-wrap items-end gap-3">
        {/* Every control in this row sizes to its own content — flex-1 here let
            the model picker eat ~80% of the row and stretched its label away
            from the chevron while the siblings stayed compact. */}
        <div className="min-w-0 shrink">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Model
          </span>
          {modelsLoading ? (
            <Select disabled value="loading-models">
              <SelectTrigger className={cn('w-44', SHELL_CONTROL_HEIGHT_CLASS)}>
                <SelectValue placeholder="Loading Genfeed models…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="loading-models">
                  Loading Genfeed models…
                </SelectItem>
              </SelectContent>
            </Select>
          ) : modelsError || hasNoSelectableModels ? (
            <Button
              variant={ButtonVariant.SECONDARY}
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
            <div className={isDisabled ? 'pointer-events-none opacity-50' : ''}>
              <ModelSelectorPopover
                name="models"
                className="w-44 min-w-0 border border-border bg-background hover:bg-accent/50"
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
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Aspect Ratio
          </span>
          <AspectRatioDropdown
            name="aspectRatio"
            value={aspectRatio}
            ratios={availableAspectRatios}
            onChange={onAspectRatioChange}
            className="border border-border bg-background hover:bg-accent/50"
            isDisabled={isDisabled}
            direction={DropdownDirection.UP}
            placeholder="Aspect ratio"
          />
        </div>
        {isImage ? (
          <div className="shrink-0">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Outputs
            </span>
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
              className="border border-border bg-background hover:bg-accent/50"
              isDisabled={isDisabled}
              direction={DropdownDirection.UP}
              placeholder="1x"
              tooltip="Number of outputs"
            />
          </div>
        ) : null}
        {/* Duration (video only, if model supports it) */}
        {showDuration ? (
          <div className="shrink-0">
            <label
              htmlFor="gen-action-duration"
              className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              Duration (seconds)
            </label>
            <Select
              value={String(duration)}
              onValueChange={(value) => onDurationChange(Number(value))}
              disabled={isDisabled}
            >
              <SelectTrigger
                id="gen-action-duration"
                className={cn('w-28', SHELL_CONTROL_HEIGHT_CLASS)}
              >
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                {durationOptions.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}s
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {showStop ? (
          <Button
            ariaLabel={translate('stopAria')}
            className={cn('shrink-0 px-3 text-xs', SHELL_CONTROL_HEIGHT_CLASS)}
            onClick={onStop}
            size={ButtonSize.SM}
            variant={ButtonVariant.DESTRUCTIVE}
          >
            <Square className="size-3.5 fill-current stroke-none" />
            {translate('stop')}
          </Button>
        ) : null}

        {showGenerate ? (
          <Button
            className={cn('shrink-0 px-3 text-xs', SHELL_CONTROL_HEIGHT_CLASS)}
            isDisabled={isPromptEmpty}
            onClick={onGenerate}
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
          >
            <Play className="size-3.5" />
            Generate {isImage ? 'Image' : 'Video'}
          </Button>
        ) : null}
      </div>
    </>
  );
}
