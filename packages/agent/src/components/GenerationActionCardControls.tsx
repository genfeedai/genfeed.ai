import type { GenerationModel } from '@genfeedai/agent/services/agent-api.service';
import {
  ButtonSize,
  ButtonVariant,
  DropdownDirection,
  type RouterPriority,
} from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { SHELL_CONTROL_HEIGHT_CLASS } from '@ui/constants/shell-chrome.constant';
import AspectRatioDropdown from '@ui/dropdowns/aspect-ratio/AspectRatioDropdown';
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
import { Play } from 'lucide-react';
import type { ReactElement, RefObject } from 'react';

type GenerationActionCardControlsProps = {
  prompt: string;
  onPromptChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  isDisabled: boolean;
  modelsLoading: boolean;
  filteredModels: GenerationModel[];
  isAutoMode: boolean;
  modelKey: string;
  autoModelLabel: string;
  prioritize: RouterPriority;
  onPrioritizeChange: (value: RouterPriority) => void;
  onModelChange: (name: string, values: string[]) => void;
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
  onGenerate: () => void;
};

export function GenerationActionCardControls({
  prompt,
  onPromptChange,
  textareaRef,
  isDisabled,
  modelsLoading,
  filteredModels,
  isAutoMode,
  modelKey,
  autoModelLabel,
  prioritize,
  onPrioritizeChange,
  onModelChange,
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
  onGenerate,
}: GenerationActionCardControlsProps): ReactElement {
  const { favoriteModelKeys, onFavoriteToggle } = useModelFavorites();

  return (
    <>
      {/* Prompt */}
      <div>
        <label
          htmlFor="gen-action-prompt"
          className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
        >
          Prompt
        </label>
        <Textarea
          id="gen-action-prompt"
          ref={textareaRef}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          disabled={isDisabled}
          rows={2}
          className="w-full resize-none"
          placeholder="Describe what you want to generate…"
        />
      </div>

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
          ) : (
            <div className={isDisabled ? 'pointer-events-none opacity-50' : ''}>
              <ModelSelectorPopover
                name="models"
                className="border border-border bg-background hover:bg-accent/50"
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
