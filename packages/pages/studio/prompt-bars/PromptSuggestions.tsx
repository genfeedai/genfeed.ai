'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type {
  PromptSuggestion,
  PromptSuggestionsProps,
} from '@props/studio/prompt-bar.props';
import { Button } from '@ui/primitives/button';
import { useMemo, useState } from 'react';
import { HiXMark } from 'react-icons/hi2';

const MODEL_SUGGESTIONS: Record<string, PromptSuggestion[]> = {
  midjourney: [
    {
      category: 'style',
      label: 'Artistic',
      value: 'artistic, creative composition',
    },
    {
      category: 'style',
      label: 'Fantasy',
      value: 'fantasy art, magical atmosphere',
    },
    {
      category: 'style',
      label: 'Minimalist',
      value: 'minimalist design, clean',
    },
  ],
  runway: [
    {
      category: 'camera',
      label: 'Smooth Motion',
      value: 'smooth camera movement',
    },
    { category: 'mood', label: 'Dynamic', value: 'dynamic action, fast-paced' },
    { category: 'camera', label: 'Slow Motion', value: 'slow motion effect' },
  ],
  'stable-diffusion-xl': [
    {
      category: 'style',
      label: 'Photorealistic',
      value: 'photorealistic, highly detailed',
    },
    {
      category: 'general',
      label: '8K Quality',
      value: '8k resolution, ultra HD',
    },
    {
      category: 'style',
      label: 'Cinematic',
      value: 'cinematic lighting, dramatic',
    },
  ],
};

const STYLE_SUGGESTIONS: Record<string, PromptSuggestion[]> = {
  anime: [
    { category: 'style', label: 'Studio Ghibli', value: 'Studio Ghibli style' },
    { category: 'style', label: 'Kawaii', value: 'cute kawaii aesthetic' },
    { category: 'style', label: 'Mecha', value: 'mecha anime style' },
  ],
  'oil-painting': [
    {
      category: 'style',
      label: 'Impressionist',
      value: 'impressionist oil painting',
    },
    {
      category: 'style',
      label: 'Renaissance',
      value: 'renaissance style painting',
    },
    { category: 'style', label: 'Abstract', value: 'abstract oil painting' },
  ],
  photography: [
    { category: 'style', label: 'Portrait', value: 'portrait photography' },
    { category: 'style', label: 'Landscape', value: 'landscape photography' },
    { category: 'style', label: 'Street', value: 'street photography' },
  ],
};

export default function PromptSuggestions({
  model,
  style,
  onSuggestionClick,
  isVisible = true,
  onClose,
}: PromptSuggestionsProps) {
  const [hiddenKey, setHiddenKey] = useState<string>('');

  const suggestionKey = `${model}-${style}`;

  const suggestions = useMemo(() => {
    const modelSuggestions = model ? (MODEL_SUGGESTIONS[model] ?? []) : [];
    const styleSuggestions = style ? (STYLE_SUGGESTIONS[style] ?? []) : [];
    const combined = [...modelSuggestions, ...styleSuggestions];

    const seen = new Set<string>();
    return combined.filter((s) => {
      if (seen.has(s.value)) {
        return false;
      }
      seen.add(s.value);
      return true;
    });
  }, [model, style]);

  if (!isVisible || suggestions.length === 0 || hiddenKey === suggestionKey) {
    return null;
  }

  function handleClose(): void {
    setHiddenKey(suggestionKey);
    onClose?.();
  }

  return (
    <div className="relative flex flex-wrap gap-2 mt-2 mb-4 p-2 bg-background">
      <div className="flex items-center justify-between w-full">
        <span className="text-xs text-muted-foreground">Suggestions</span>
        <Button
          withWrapper={false}
          variant={ButtonVariant.UNSTYLED}
          onClick={handleClose}
          size={ButtonSize.XS}
          ariaLabel="Close suggestions"
        >
          <HiXMark className="w-3 h-3" />
        </Button>
      </div>

      {suggestions.map((suggestion, index) => (
        <Button
          key={index}
          label={suggestion.label}
          onClick={() => onSuggestionClick(suggestion.value)}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
        />
      ))}
    </div>
  );
}
