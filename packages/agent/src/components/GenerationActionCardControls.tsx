import type { GenerationModel } from '@genfeedai/agent/services/agent-api.service';
import type { RouterPriority } from '@genfeedai/enums';
import AspectRatioDropdown from '@ui/dropdowns/aspect-ratio/AspectRatioDropdown';
import ModelSelectorPopover from '@ui/dropdowns/model-selector/ModelSelectorPopover';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { useModelFavorites } from '@ui/dropdowns/model-selector/useModelFavorites';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
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

      {/* Model & Aspect Ratio row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Model
          </span>
          {modelsLoading ? (
            <Select disabled value="loading-models">
              <SelectTrigger className="w-full">
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
                className="w-full justify-between border border-border bg-background hover:bg-accent/50"
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
        <div>
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Aspect Ratio
          </span>
          <AspectRatioDropdown
            name="aspectRatio"
            value={aspectRatio}
            ratios={availableAspectRatios}
            onChange={onAspectRatioChange}
            className="w-full justify-between border border-border bg-background hover:bg-accent/50"
            isDisabled={isDisabled}
            placeholder="Aspect ratio"
          />
        </div>
      </div>

      {/* Duration (video only, if model supports it) */}
      {showDuration && (
        <div>
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
            <SelectTrigger id="gen-action-duration" className="w-full">
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
      )}
    </>
  );
}
