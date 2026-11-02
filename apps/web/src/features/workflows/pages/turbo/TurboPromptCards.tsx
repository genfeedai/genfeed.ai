'use client';

import type { PromptBarSuggestionItem } from '@genfeedai/props/prompt-bars/prompt-bar-suggestion-item.props';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import type { TurboPresetCardsProps } from '@/features/workflows/props/turbo-presets.props';
import { TURBO_PRESETS } from './turbo-presets';

/**
 * The Turbo starters as prompt cards, in the same tiles as the Agent and
 * Storyboard. A click fills the prompt, the format and the idea count; it
 * never creates anything.
 */
export default function TurboPromptCards({
  isDisabled = false,
  onSelect,
}: TurboPresetCardsProps): ReactElement {
  const translate = useTranslations('pages.turboProjects.presets.items');
  const suggestions: PromptBarSuggestionItem[] = TURBO_PRESETS.map((preset) => {
    const Icon = preset.icon;
    return {
      description: translate(`${preset.id}.description`),
      icon: <Icon />,
      id: preset.id,
      label: translate(`${preset.id}.title`),
      prompt: preset.angle,
    };
  });

  return (
    <div className="@container w-full min-w-0" data-testid="turbo-prompt-cards">
      <PromptBarSuggestions
        className="grid grid-cols-1 @md:grid-cols-2 [&>button]:w-full [&>button]:max-w-none"
        isDisabled={isDisabled}
        maxSuggestions={TURBO_PRESETS.length}
        onSuggestionSelect={(suggestion) => {
          const preset = TURBO_PRESETS.find(
            (candidate) => candidate.id === suggestion.id,
          );
          if (preset) onSelect(preset, suggestion.label);
        }}
        suggestions={suggestions}
        variant="cards"
      />
    </div>
  );
}
