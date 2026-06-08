'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';

type CharacterOption = {
  id: string;
  slug: string;
  label: string;
  emoji?: string;
};

type ModelOption = {
  label: string;
  value: string;
};

type AspectRatioOption = {
  label: string;
  value: string;
};

type GenerationFormProps = {
  characters: CharacterOption[];
  selectedCharacter: string;
  onSelectedCharacterChange: (value: string) => void;
  model: string;
  onModelChange: (value: string) => void;
  modelOptions: ModelOption[];
  aspectRatio: string;
  onAspectRatioChange: (value: string) => void;
  aspectRatioOptions: AspectRatioOption[];
  steps: number;
  onStepsChange: (value: number) => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  negativePrompt: string;
  onNegativePromptChange: (value: string) => void;
  isUseLora: boolean;
  onIsUseLoraChange: (value: boolean) => void;
  isGenerating: boolean;
  onGenerate: () => void;
};

export default function GenerationForm({
  characters,
  selectedCharacter,
  onSelectedCharacterChange,
  model,
  onModelChange,
  modelOptions,
  aspectRatio,
  onAspectRatioChange,
  aspectRatioOptions,
  steps,
  onStepsChange,
  prompt,
  onPromptChange,
  negativePrompt,
  onNegativePromptChange,
  isUseLora,
  onIsUseLoraChange,
  isGenerating,
  onGenerate,
}: GenerationFormProps) {
  return (
    <WorkspaceSurface
      title="Generate Image"
      tone="muted"
      data-testid="darkroom-generate-surface"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Character Selector */}
          <div>
            <span className="block text-sm font-medium text-foreground/70 mb-1">
              Character
            </span>
            <Select
              onValueChange={onSelectedCharacterChange}
              value={selectedCharacter}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a character…" />
              </SelectTrigger>
              <SelectContent>
                {characters.map((c) => (
                  <SelectItem key={c.id} value={c.slug}>
                    {c.emoji ? `${c.emoji} ` : ''}
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Model Selector */}
          <div>
            <span className="block text-sm font-medium text-foreground/70 mb-1">
              Model
            </span>
            <Select onValueChange={onModelChange} value={model}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Aspect Ratio */}
          <div>
            <span className="block text-sm font-medium text-foreground/70 mb-1">
              Aspect Ratio
            </span>
            <Select onValueChange={onAspectRatioChange} value={aspectRatio}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {aspectRatioOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Steps */}
          <div>
            <span className="block text-sm font-medium text-foreground/70 mb-1">
              Steps
            </span>
            <Input
              className="w-full"
              min={1}
              max={100}
              onChange={(e) => onStepsChange(Number(e.target.value))}
              type="number"
              value={steps}
            />
          </div>
        </div>

        {/* Prompt */}
        <div className="mb-4">
          <span className="block text-sm font-medium text-foreground/70 mb-1">
            Prompt
          </span>
          <Textarea
            className="w-full min-h-[80px]"
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder="Describe the image you want to generate..."
            rows={3}
            value={prompt}
          />
        </div>

        {/* Negative Prompt */}
        <div className="mb-4">
          <span className="block text-sm font-medium text-foreground/70 mb-1">
            Negative Prompt
          </span>
          <Input
            className="w-full"
            onChange={(e) => onNegativePromptChange(e.target.value)}
            placeholder="What to avoid in the image..."
            value={negativePrompt}
          />
        </div>

        {/* LoRA Toggle */}
        <div className="mb-4 flex items-center gap-2">
          <Checkbox
            checked={isUseLora}
            id="use-lora"
            onCheckedChange={(checked) => onIsUseLoraChange(checked === true)}
          />
          <label
            className="text-sm font-medium text-foreground/70"
            htmlFor="use-lora"
          >
            Apply character LoRA (if trained)
          </label>
        </div>

        <Button
          withWrapper={false}
          size={ButtonSize.SM}
          variant={ButtonVariant.DEFAULT}
          isDisabled={!selectedCharacter || !prompt.trim() || isGenerating}
          onClick={onGenerate}
        >
          {isGenerating ? 'Generating…' : 'Generate Image'}
        </Button>
      </div>
    </WorkspaceSurface>
  );
}
